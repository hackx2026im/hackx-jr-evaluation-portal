-- ============================================================
-- hackX jr 9.0 Evaluation Dashboard
-- Migration 018: Lock down profiles.role against self-promotion
-- Run this in the Supabase SQL Editor AFTER 001-017.
-- ============================================================
-- Audit finding (Critical #1): the "evaluator_profiles_update_onboarding"
-- policy from migration 011 only checks `id = auth.uid()` — it never
-- restricted which columns a user may change. Any authenticated evaluator
-- could send a raw PostgREST UPDATE to set their own profiles.role to
-- 'admin'. RLS cannot restrict individual columns on its own, so this is
-- enforced with a BEFORE UPDATE trigger instead.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF (SELECT public.get_user_role()) IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins may change a profile''s role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

COMMENT ON FUNCTION public.prevent_role_self_escalation IS
  'Blocks any UPDATE to profiles.role unless the caller already has role=admin. Closes the self-promotion gap left open by migration 011.';
