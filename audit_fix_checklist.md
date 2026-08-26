# Audit Fix Testing Checklist

Test cases for the fixes on branch `fix/critical-rls-security`, addressing
`hackx-jr-audit-findings.md`. Run this against a **staging Supabase
project first**. Do not check items off against production until staging
passes in full.

**Setup needed before testing:**
- A staging Supabase project with migrations `001`–`020` applied, in order.
- At least two evaluator test accounts (`Evaluator A`, `Evaluator B`) and one admin test account.
- At least two proposals: one assigned to Evaluator A only, one assigned to Evaluator B only.
- Browser devtools access (to run raw `supabase-js` calls from the console) for the RLS-bypass tests — these are the tests that prove the fix, not just the UI.

---

## Phase 1 — Critical

### 1.1 Role self-promotion is blocked (`018_lock_profile_role.sql`)

- [ ] Log in as **Evaluator A**. From the browser console, run:
  ```js
  await supabase.from('profiles').update({ role: 'admin' }).eq('id', '<evaluatorA-id>')
  ```
  **Expected:** request fails with a permission/trigger error. `profiles.role` for Evaluator A is unchanged.
- [ ] As **Admin**, update a real evaluator's role via the normal admin UI (e.g. Evaluators page) if such a control exists, or via `supabase.from('profiles').update({ role: ... })`.
  **Expected:** succeeds — admins can still change roles.
- [ ] As **Evaluator A**, trigger the onboarding-seen flag update (open the app for the first time / dismiss onboarding modal, which updates `has_seen_onboarding`).
  **Expected:** succeeds — non-role profile updates are unaffected.
- [ ] As **Evaluator A**, update your own `full_name` via any profile-edit UI, if present.
  **Expected:** succeeds.

### 1.2 Evaluations RLS enforces assignment, lock, and score cap (`019_secure_evaluations_rls.sql`)

- [ ] Log in as **Evaluator A**. From the console, attempt to upsert an evaluation for a proposal assigned to **Evaluator B** (not you):
  ```js
  await supabase.from('evaluations').upsert({
    proposal_id: '<proposalB-id>', evaluator_id: '<evaluatorA-id>',
    rubric_criterion_id: '<any-criterion-id>', score: 1
  })
  ```
  **Expected:** fails (RLS policy violation). No row is written.
- [ ] As **Evaluator A**, upsert a score above a criterion's `max_score` (e.g. criterion max is 10, submit `score: 999`) for a proposal you *are* assigned to, via raw upsert.
  **Expected:** fails.
- [ ] As **Evaluator A**, upsert a negative score (`score: -5`) for an assigned proposal.
  **Expected:** fails.
- [ ] As **Admin**, set `system_settings.evaluations_locked` to `true`.
- [ ] As **Evaluator A**, attempt to submit/edit a grade on an assigned proposal (via the real UI, and via raw upsert) while locked.
  **Expected:** both fail / are blocked.
- [ ] As **Admin**, with `evaluations_locked = true`, edit any evaluation (admin override).
  **Expected:** succeeds — admins bypass the lock.
- [ ] Set `evaluations_locked` back to `false`. As **Evaluator A**, submit a valid grade (correct assignment, in-range score) via the normal evaluation UI.
  **Expected:** succeeds, exactly as before this change — confirms the RPC-based happy path still works end to end.

---

## Phase 2 — High

### 2.1 Overall comments persist

- [ ] As **Evaluator A**, grade an assigned proposal and enter text in "Overall Comments." Submit.
- [ ] Reload the page (or navigate away and back to the same evaluation).
  **Expected:** the overall comment text is still there — not blank.
- [ ] Check `evaluation_overall_notes` in the DB directly for that `proposal_id` + `evaluator_id`.
  **Expected:** a row exists with `evaluator_id` populated and `notes` matching what was typed.

### 2.2 Assigned evaluators can view (not edit) after lock

- [ ] As **Evaluator A**, grade and submit an assigned proposal fully (so `is_graded = true` / evaluations exist).
- [ ] As **Admin**, set `evaluations_locked = true`.
- [ ] As **Evaluator A**, navigate to that same proposal's evaluate page.
  **Expected:** page loads (no redirect to `/evaluator?error=locked`), shows a "Read Only" state, scores are visible but not editable.
- [ ] As **Evaluator A**, navigate to a proposal you are **not** assigned to, while locked.
  **Expected:** redirected to `/evaluator?error=not_assigned` (unchanged behavior).
- [ ] Set `evaluations_locked` back to `false`.
  **Expected:** Evaluator A can edit the previously-graded proposal again ("Edit Grading" button works).

### 2.3 PDF proxy SSRF protections

- [ ] Open a proposal with a normal Google Drive PDF link through the app's PDF viewer.
  **Expected:** PDF loads normally — confirms the allowlist didn't break the legitimate path.
- [ ] While authenticated, directly request:
  ```
  GET /api/proxy/pdf?url=http://169.254.169.254/latest/meta-data/
  ```
  **Expected:** request is rejected (400-level error), no data returned.
- [ ] Directly request a non-Drive public URL, e.g. `/api/proxy/pdf?url=https://example.com/some.pdf`.
  **Expected:** rejected — host not on the allowlist.
- [ ] Directly request `/api/proxy/pdf?url=http://localhost:5432/` or `http://127.0.0.1/`.
  **Expected:** rejected.
- [ ] (If feasible) Try a Drive URL that redirects to a non-Drive host, or set up a short-lived redirect test.
  **Expected:** rejected at whichever hop leaves the allowlist.

---

## Phase 3 — Medium

### 3.1 Lowering rubric max_score flags existing over-max scores

- [ ] As **Admin**, find a rubric criterion with at least one evaluator's score recorded against it.
- [ ] Lower that criterion's `max_score` to below at least one existing recorded score.
  **Expected:** a warning toast appears naming how many existing evaluations now exceed the new max. No scores are auto-modified — check the DB to confirm the old score values are untouched.
- [ ] Lower a `max_score` where no existing scores exceed the new value.
  **Expected:** no warning toast (nothing to flag).
- [ ] Raise a `max_score` (increase it).
  **Expected:** no warning toast (only lowering triggers the check).

### 3.2 Dead code removed

- [ ] `grep -rn "isLockedByOther"` across the repo returns nothing.
  **Expected:** confirmed removed, `npm run build` / `tsc --noEmit` still pass.

### 3.3 nightly-backup logs loudly when misconfigured

- [ ] In a local/staging environment, unset `BACKUP_SECRET` and call `POST /api/nightly-backup` without the header, authenticated as an admin.
  **Expected:** request still succeeds (admin fallback preserved), but server logs show a clear `[nightly-backup] BACKUP_SECRET is not set...` error — not silent.
- [ ] With `BACKUP_SECRET` set, call the route with the correct `x-backup-secret` header (no user session needed).
  **Expected:** succeeds, no misconfiguration warning logged.
- [ ] Call the route with a wrong secret and no admin session.
  **Expected:** `401 Unauthorized`.

### 3.4 PDF annotations RLS enforces assignment (`020_secure_annotations_rls.sql`)

- [ ] As **Evaluator A**, add a PDF annotation on a proposal assigned to you.
  **Expected:** succeeds.
- [ ] As **Evaluator A**, attempt (via raw `supabase.from('pdf_annotations').insert(...)`) to add an annotation on a proposal assigned only to **Evaluator B**.
  **Expected:** fails.
- [ ] As **Evaluator A**, attempt to update/delete one of your own annotations on an assigned proposal.
  **Expected:** succeeds.
- [ ] As **Evaluator A**, attempt to update/delete an annotation on a proposal not assigned to you (even if `evaluator_id` somehow matched, e.g. testing the policy directly).
  **Expected:** fails.

### 3.5 React Compiler warnings resolved

- [ ] Run `npx eslint components/pdf-annotation-panel.tsx`.
  **Expected:** no `react-hooks/preserve-manual-memoization` errors on `onDocumentLoadSuccess` / `onDocumentLoadError`.
- [ ] Open a proposal's PDF tab and confirm document load / load-error states still behave correctly (load a valid PDF; then break the URL and confirm the error state shows).

---

## Phase 4 — Low / Nitpick

- [ ] Create a new evaluator account via the admin "Invite/Create Evaluator" flow with a password under 6 characters.
  **Expected:** rejected with a clear error, both client-side and if bypassed client-side (test via direct `POST /api/create-evaluator` with a short password).
- [ ] Create an evaluator account with a 6+ character password.
  **Expected:** succeeds as before.
- [ ] Open any proposal's PDF viewer and check the Network tab.
  **Expected:** the PDF.js worker loads from your own origin (`/pdf.worker.min.mjs`), not `unpkg.com`.
- [ ] Run `npm install` fresh (e.g. after `rm -rf node_modules public/pdf.worker.min.mjs`) and confirm `public/pdf.worker.min.mjs` is regenerated automatically.
- [ ] Bulk-upload a CSV with a large number of rows (or temporarily lower `CHUNK_SIZE` in `app/admin/proposals/page.tsx` for testing) to confirm chunked inserts work and report an accurate "Successfully uploaded N proposals" count.
- [ ] Bulk-upload a CSV where a later chunk fails (e.g. a duplicate/invalid row placed past row 500 in a large file).
  **Expected:** toast reports how many were uploaded before the failure, not a silent full failure.
- [ ] Visual check: sidebar and evaluation-locked dialog render normally (confirms the unused-import removals didn't break anything).
- [ ] Visual check: navbar logo renders at the same size/position as before (confirms the `next/image` swap didn't shift layout).

---

## Sign-off

- [ ] All Phase 1 (Critical) tests pass on staging.
- [ ] All Phase 2 (High) tests pass on staging.
- [ ] All Phase 3 (Medium) tests pass on staging.
- [ ] All Phase 4 (Low/Nitpick) tests pass on staging.
- [ ] `npx tsc --noEmit` and `npm run build` both pass cleanly.
- [ ] Migrations 018–020 applied to **production** Supabase project.
- [ ] Post-deploy smoke test on production: role-escalation test (1.1) and evaluation-bypass test (1.2) repeated against prod.

Tested by: ______________  Date: ______________
