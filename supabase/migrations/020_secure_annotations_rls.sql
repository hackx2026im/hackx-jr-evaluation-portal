-- ============================================================
-- hackX jr 9.0 Evaluation Dashboard
-- Migration 020: Secure pdf_annotations RLS (assignment check)
-- Run this in the Supabase SQL Editor AFTER 001-019.
-- ============================================================
-- Audit finding (Medium #9): pdf_annotations INSERT/UPDATE/DELETE
-- policies (migration 009) only check evaluator_id = auth.uid(), the
-- same gap as evaluations before migration 019 — an evaluator could
-- raw-insert/update/delete annotations on a proposal never assigned to
-- them. Lower stakes than the evaluations gap (non-scoring commentary),
-- but closed here for consistency.
-- ============================================================

DROP POLICY IF EXISTS "annotations_insert" ON public.pdf_annotations;

CREATE POLICY "annotations_insert"
  ON public.pdf_annotations FOR INSERT TO authenticated
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.proposal_assignments
      WHERE proposal_id = pdf_annotations.proposal_id
        AND evaluator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "annotations_update" ON public.pdf_annotations;

CREATE POLICY "annotations_update"
  ON public.pdf_annotations FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid())
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.proposal_assignments
      WHERE proposal_id = pdf_annotations.proposal_id
        AND evaluator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "annotations_delete" ON public.pdf_annotations;

CREATE POLICY "annotations_delete"
  ON public.pdf_annotations FOR DELETE TO authenticated
  USING (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.proposal_assignments
      WHERE proposal_id = pdf_annotations.proposal_id
        AND evaluator_id = auth.uid()
    )
  );
