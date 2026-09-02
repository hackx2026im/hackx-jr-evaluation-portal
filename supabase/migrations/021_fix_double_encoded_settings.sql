-- ============================================================
-- hackX jr 9.0 Evaluation Dashboard
-- Migration 021: Repair double-encoded system_settings values
-- Run this in the Supabase SQL Editor AFTER 001-020.
-- ============================================================
-- Bug: PATCH /api/system-settings (app/api/system-settings/route.ts)
-- used to do `value: JSON.stringify(value)` where `value` was already a
-- plain string (e.g. "true"/"false" from the evaluations_locked toggle).
-- Combined with supabase-js JSON-encoding the row once more on the way
-- out, this stored a double-encoded jsonb string — e.g. the 6-character
-- string `"true"` (quotes included) instead of the 4-character string
-- `true`. None of the read paths (SQL or TypeScript) ever match that
-- form, so `evaluations_locked` silently never took effect.
--
-- This repairs any system_settings row whose stored jsonb value is a
-- string, where that string's own text content also happens to be valid
-- JSON (the signature of one extra layer of encoding). Values that are
-- not double-encoded fail the inner ::jsonb cast and are left untouched.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  unwrapped JSONB;
BEGIN
  FOR r IN
    SELECT key, value FROM public.system_settings WHERE jsonb_typeof(value) = 'string'
  LOOP
    BEGIN
      unwrapped := (r.value #>> '{}')::jsonb;
      UPDATE public.system_settings
      SET value = unwrapped, updated_at = now()
      WHERE key = r.key;
      RAISE NOTICE 'Repaired double-encoded system_settings.% (was %, now %)', r.key, r.value, unwrapped;
    EXCEPTION WHEN OTHERS THEN
      -- Inner content isn't valid JSON on its own, so this value was
      -- never double-encoded to begin with. Leave it as-is.
      NULL;
    END;
  END LOOP;
END;
$$;
