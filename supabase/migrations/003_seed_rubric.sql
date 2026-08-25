-- ============================================================
-- hackX jr 9.0 Evaluation Dashboard
-- Migration 003: Seed Rubric Data
-- Run this AFTER 001 & 002 in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- SECTION 1: Proposal (100 marks)
-- ============================================================
INSERT INTO public.rubric_sections (id, name, total_marks, order_index)
VALUES ('a1000000-0000-0000-0000-000000000001', 'Proposal', 100, 1)
ON CONFLICT (id) DO UPDATE SET total_marks = EXCLUDED.total_marks, name = EXCLUDED.name, order_index = EXCLUDED.order_index;

-- 1.1 Problem Definition (Max 20)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'Problem definition',
  'Problem is sharply defined with clear context, stakeholders, urgency, and a concise solution preview.',
  20,
  '["Excellent · 16–20", "Good · 11–15", "Developing · 6–10", "Weak / Fail · 0–5"]'::jsonb,
  1
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.2 Analysis (Max 15)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'Analysis',
  'Root causes clearly analyzed; key affected groups identified; existing solutions evaluated with specific gaps; competitors and substitutes outlined.',
  15,
  '["Excellent · 12–15", "Good · 8–11", "Developing · 4–7", "Weak / Fail · 0–3"]'::jsonb,
  2
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.3 Solution (Max 15)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'Solution',
  'Solution is clearly and practically described, directly addressing the problem; core features explained at the right level of detail.',
  15,
  '["Excellent · 12–15", "Good · 8–11", "Developing · 4–7", "Weak / Fail · 0–3"]'::jsonb,
  3
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.4 Product overview & uniqueness (Max 15)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000001',
  'Product overview & uniqueness',
  'Compelling overview of what the product is, who it serves, and how it uniquely delivers value; differentiation is specific and well-argued.',
  15,
  '["Excellent · 12–15", "Good · 8–11", "Developing · 4–7", "Weak / Fail · 0–3"]'::jsonb,
  4
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.5 Business model & marketing plan (Max 15)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000001',
  'Business model & marketing plan',
  'Target users and customers clearly distinguished; value creation well-articulated; revenue model or sustainability plan is specific and plausible.',
  15,
  '["Excellent · 12–15", "Good · 8–11", "Developing · 4–7", "Weak / Fail · 0–3"]'::jsonb,
  5
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.6 Technical overview & implementation (Max 10)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000001',
  'Technical overview & implementation',
  'High-level architecture clearly described; relevant tools, frameworks and integrations named; scalability, security or performance considerations addressed.',
  10,
  '["Excellent · 8–10", "Good · 5–7", "Developing · 3–4", "Weak / Fail · 0–2"]'::jsonb,
  6
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.7 User scenario (Max 5)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000007',
  'a1000000-0000-0000-0000-000000000001',
  'User scenario',
  'Realistic, well-defined user scenario with clear step-by-step interaction and a concrete outcome.',
  5,
  '["Excellent · 5", "Good · 3-4", "Weak / Fail · 0–2"]'::jsonb,
  7
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- 1.8 Conclusion (Max 5)
INSERT INTO public.rubric_criteria (id, section_id, name, description, max_score, grading_bands, order_index)
VALUES (
  'c1000000-0000-0000-0000-000000000008',
  'a1000000-0000-0000-0000-000000000001',
  'Conclusion',
  'Concise summary of problem, solution and impact; reinforces value; future directions mentioned.',
  5,
  '["Excellent · 5", "Good · 3-4", "Weak / Fail · 0–2"]'::jsonb,
  8
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, max_score = EXCLUDED.max_score, grading_bands = EXCLUDED.grading_bands, order_index = EXCLUDED.order_index;

-- NOTE: Pitch Video (30 marks) has been removed for hackX jr 9.0.
