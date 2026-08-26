-- ============================================================
-- hackX jr 9.0 Evaluation Dashboard
-- Migration 019: Secure evaluations RLS (assignment, lock, score cap)
-- Run this in the Supabase SQL Editor AFTER 001-018.
-- ============================================================
-- Audit finding (Critical #2): the evaluations INSERT/UPDATE policies from
-- migration 002 only check `evaluator_id = auth.uid()`. Assignment
-- checking, the evaluations-locked deadline, and the score-vs-max_score
-- cap are only enforced inside the submit_evaluation() RPC (migrations
-- 016/017) — a raw `supabase.from('evaluations').upsert(...)` call from
-- devtools bypasses all three. This migration pushes the same guards down
-- into RLS so the database is the real trust boundary, not just app
-- convention.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helper: are evaluations currently locked (system_settings)?
--    SECURITY DEFINER so it can be evaluated inside RLS policies
--    regardless of the caller's own row visibility.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluations_are_locked()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_settings
    WHERE key = 'evaluations_locked'
      AND (value = '"true"'::jsonb OR value = 'true'::jsonb)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 2. Helper: is this score within the criterion's max_score?
--    (also rejects negative scores)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_within_bounds(p_criterion_id UUID, p_score INT)
RETURNS BOOLEAN AS $$
  SELECT p_score >= 0 AND p_score <= max_score
  FROM public.rubric_criteria
  WHERE id = p_criterion_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- 3. Replace evaluator INSERT policy on evaluations
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "evaluator_evaluations_insert" ON public.evaluations;

CREATE POLICY "evaluator_evaluations_insert"
  ON public.evaluations FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND (SELECT public.get_user_role()) = 'evaluator'
    AND EXISTS (
      SELECT 1 FROM public.proposal_assignments
      WHERE proposal_id = evaluations.proposal_id
        AND evaluator_id = auth.uid()
    )
    AND NOT public.evaluations_are_locked()
    AND public.score_within_bounds(evaluations.rubric_criterion_id, evaluations.score)
  );

-- ------------------------------------------------------------
-- 4. Replace evaluator UPDATE policy on evaluations
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "evaluator_evaluations_update" ON public.evaluations;

CREATE POLICY "evaluator_evaluations_update"
  ON public.evaluations FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid())
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.proposal_assignments
      WHERE proposal_id = evaluations.proposal_id
        AND evaluator_id = auth.uid()
    )
    AND NOT public.evaluations_are_locked()
    AND public.score_within_bounds(evaluations.rubric_criterion_id, evaluations.score)
  );

COMMENT ON FUNCTION public.evaluations_are_locked IS
  'True when the evaluations_locked system_settings flag is set. Used by evaluations RLS so the lock is enforced at the database level, not just inside submit_evaluation().';
COMMENT ON FUNCTION public.score_within_bounds IS
  'True when a score is between 0 and the rubric criterion''s max_score. Used by evaluations RLS to cap scores at the database level.';
