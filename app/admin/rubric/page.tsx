import { createClient } from "@/lib/supabase/server";
import { RubricEditorClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rubric Editor | hackX jr",
  description: "Manage the evaluation rubric for hackX jr",
};

export default async function AdminRubricPage() {
  const supabase = await createClient();

  const { data: sections, error } = await supabase
    .from("rubric_sections")
    .select("*, rubric_criteria(*)")
    .order("order_index", { ascending: true });

  if (error) {
    console.error("[AdminRubricPage] Failed to load rubric:", error.message);
  }

  // Sort criteria within each section by order_index
  const sortedSections = (sections ?? []).map((s) => ({
    ...s,
    rubric_criteria: ((s.rubric_criteria ?? []) as any[]).sort(
      (a, b) => a.order_index - b.order_index
    ),
  }));

  return <RubricEditorClient initialSections={sortedSections} />;
}
