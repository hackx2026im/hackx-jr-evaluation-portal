-- ============================================================
-- hackX Evaluation Dashboard
-- Migration 017: Rubric & Score Validation Constraints
-- Run this LAST (after 001–016) in the Supabase SQL Editor.
-- ============================================================
-- Validation gaps found in 001_schema.sql:
--   • rubric_sections.total_marks  — no lower-bound check
--   • rubric_criteria.max_score    — no lower-bound check
--   • evaluations.score            — no lower-bound check
--   • submit_evaluation RPC        — no score-vs-max_score validation
-- ============================================================

-- 1. Section total_marks must be non-negative
ALTER TABLE public.rubric_sections
  ADD CONSTRAINT chk_section_total_marks_nonneg
  CHECK (total_marks >= 0);

-- 2. Criterion max_score must be at least 1
ALTER TABLE public.rubric_criteria
  ADD CONSTRAINT chk_criterion_max_score_positive
  CHECK (max_score > 0);

-- 3. Evaluation score must be non-negative
ALTER TABLE public.evaluations
  ADD CONSTRAINT chk_evaluation_score_nonneg
  CHECK (score >= 0);

-- ============================================================
-- 4. Upgrade submit_evaluation RPC
--    Added: each submitted score must satisfy
--    0 <= score <= rubric_criteria.max_score for that criterion.
--    All other guards (auth, lock, assignment) preserved from 016.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_evaluation(
  p_proposal_id UUID,
  p_evaluations JSONB
) RETURNS VOID AS $$
DECLARE
  v_evaluator_id   UUID;
  elem             JSONB;
  v_new_score      INT;
  v_is_admin       BOOLEAN;
  v_locked         BOOLEAN;
  v_max_score      INT;
  v_criterion_name TEXT;
  v_submitted_score INT;
BEGIN
  v_evaluator_id := auth.uid();
  IF v_evaluator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_evaluator_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.system_settings
      WHERE key = 'evaluations_locked'
        AND (value = '"true"'::jsonb OR value = 'true'::jsonb)
    ) INTO v_locked;
    IF v_locked THEN
      RAISE EXCEPTION 'Evaluations are locked. You cannot modify your grades after the deadline.';
    END IF;
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.proposal_assignments
    WHERE proposal_id = p_proposal_id AND evaluator_id = v_evaluator_id
  ) THEN
    RAISE EXCEPTION 'Not assigned to this proposal';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_evaluations)
  LOOP
    v_submitted_score := (elem->>'score')::INT;

    SELECT max_score, name
    INTO   v_max_score, v_criterion_name
    FROM   public.rubric_criteria
    WHERE  id = (elem->>'rubric_criterion_id')::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Criterion % does not exist', elem->>'rubric_criterion_id';
    END IF;

    IF v_submitted_score < 0 THEN
      RAISE EXCEPTION 'Score for "%" cannot be negative (got %)', v_criterion_name, v_submitted_score;
    END IF;

    IF v_submitted_score > v_max_score THEN
      RAISE EXCEPTION 'Score % for "%" exceeds the maximum allowed score of %',
        v_submitted_score, v_criterion_name, v_max_score;
    END IF;

    INSERT INTO public.evaluations
      (proposal_id, evaluator_id, rubric_criterion_id, score, notes, updated_at)
    VALUES (
      p_proposal_id,
      v_evaluator_id,
      (elem->>'rubric_criterion_id')::UUID,
      v_submitted_score,
      elem->>'notes',
      now()
    )
    ON CONFLICT (proposal_id, evaluator_id, rubric_criterion_id)
    DO UPDATE SET
      score      = EXCLUDED.score,
      notes      = EXCLUDED.notes,
      updated_at = now();
  END LOOP;

  WITH evaluator_totals AS (
    SELECT evaluator_id, SUM(score) AS total
    FROM   public.evaluations
    WHERE  proposal_id = p_proposal_id
    GROUP  BY evaluator_id
  )
  SELECT ROUND(AVG(total)) INTO v_new_score FROM evaluator_totals;

  UPDATE public.proposals
  SET
    is_graded   = true,
    total_score = COALESCE(v_new_score, 0)
  WHERE id = p_proposal_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
