import { createClient } from "@/lib/supabase/server";
import { UploadProposalsClient } from "./client";

export default async function UploadProposalsPage() {
  const supabase = await createClient();

  const { data: proposals } = await supabase
    .from("proposals")
    .select("*")
    .order("created_at", { ascending: false });

  return <UploadProposalsClient proposals={proposals ?? []} />;
}
