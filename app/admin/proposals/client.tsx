"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Type,
  Package,
  FileSpreadsheet,
  Download,
  Loader2,
  Plus,
  X,
  ListChecks,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import Papa from "papaparse";
import type { Proposal } from "@/lib/types/database";

interface Props {
  proposals: Proposal[];
}

export function UploadProposalsClient({ proposals: initialProposals }: Props) {
  const [teamName, setTeamName] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [proposalUrls, setProposalUrls] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  const refreshProposals = async () => {
    const { data } = await supabase
      .from("proposals")
      .select("*")
      .order("created_at", { ascending: false });
    setProposals(data ?? []);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validUrls = proposalUrls.filter(url => url.trim() !== "");
    if (!teamName || validUrls.length === 0) {
      toast.error("Team Name and at least one Proposal PDF Link are required");
      return;
    }

    setLoading(true);

    const { count, error: countError } = await supabase
      .from("proposals")
      .select("*", { count: "exact", head: true })
      .eq("team_name", teamName);

    if (countError) {
      toast.error("Failed to check existing proposals for team");
      setLoading(false);
      return;
    }

    const currentCount = count || 0;
    const proposalsToInsert = validUrls.map((url, index) => {
      let finalProductName = productName;
      if (!finalProductName) {
        finalProductName = `Proposal #${(currentCount + index + 1).toString().padStart(2, '0')}`;
      } else if (validUrls.length > 1) {
        finalProductName = `${productName} ${index + 1}`;
      }
      return {
        team_name: teamName,
        product_name: finalProductName,
        description,
        proposal_url: url,
      };
    });

    const { error } = await supabase.from("proposals").insert(proposalsToInsert);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success(`Successfully uploaded ${proposalsToInsert.length} proposal(s)!`);
    setTeamName("");
    setProductName("");
    setDescription("");
    setProposalUrls([""]);
    router.refresh();
    await refreshProposals();
    setLoading(false);
  };

  const downloadTemplate = () => {
    const templateContent = "team_name,product_name,description,drive_link_1,drive_link_2,drive_link_3,drive_link_4,drive_link_5\nExample Team,SmartLearn AI,An AI-powered learning system,https://drive.google.com/file/...,,,,";
    const blob = new Blob([templateContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "hackX_jr_proposals_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];

        if (rows.length === 0) {
          toast.error("The CSV file is empty");
          setBulkLoading(false);
          return;
        }

        // Get headers from the first row to check for case-insensitive matches
        const headers = Object.keys(rows[0]);
        const findHeader = (target: string) => headers.find(h => h.toLowerCase() === target.toLowerCase());

        const teamNameHeader = findHeader("team_name");
        const driveLinkHeaders = headers.filter(h => h.toLowerCase().startsWith("drive_link"));
        const productNameHeader = findHeader("product_name");
        const descriptionHeader = findHeader("description");

        if (!teamNameHeader || driveLinkHeaders.length === 0) {
          const missing = [];
          if (!teamNameHeader) missing.push("'team_name'");
          if (driveLinkHeaders.length === 0) missing.push("'drive_link_1'");
          toast.error(`Invalid CSV format. Missing required columns: ${missing.join(", ")}`);
          setBulkLoading(false);
          return;
        }

        const proposalsToInsert = [];
        const errors: string[] = [];

        // Track local counts per team for auto-numbering within this batch
        const teamCounts: Record<string, number> = {};

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 1;
          const teamName = row[teamNameHeader as string]?.trim();

          const validLinks: string[] = [];
          for (const header of driveLinkHeaders) {
            const link = row[header]?.trim();
            if (link) validLinks.push(link);
          }

          if (!teamName || validLinks.length === 0) {
            errors.push(`Row ${rowNum}: Missing team_name or at least one drive_link`);
            continue;
          }

          if (!teamCounts[teamName]) teamCounts[teamName] = 0;

          for (let j = 0; j < validLinks.length; j++) {
            teamCounts[teamName]++;
            let pName = row[productNameHeader as string]?.trim();
            if (!pName) {
              pName = `Proposal #${teamCounts[teamName].toString().padStart(2, '0')}`;
            } else if (validLinks.length > 1) {
              pName = `${pName} ${j + 1}`;
            }

            proposalsToInsert.push({
              team_name: teamName,
              product_name: pName,
              description: row[descriptionHeader as string]?.trim() || "",
              proposal_url: validLinks[j],
            });
          }
        }

        if (errors.length > 0) {
          const errorMsg = errors.slice(0, 3).join("\n") + (errors.length > 3 ? `\n...and ${errors.length - 3} more errors` : "");
          toast.error(`Validation Failed:\n${errorMsg}`, { duration: 5000 });
          setBulkLoading(false);
          return;
        }

        // Note: For a more robust implementation, we would fetch existing counts for all these teams first.
        // For now, we assume the batch upload contains all proposals for the team if they are uploaded together.
        // Chunk the insert so a very large CSV doesn't hit Supabase's request
        // payload limit in a single call.
        const CHUNK_SIZE = 500;
        let insertedCount = 0;
        let chunkError: string | null = null;

        for (let i = 0; i < proposalsToInsert.length; i += CHUNK_SIZE) {
          const chunk = proposalsToInsert.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase.from("proposals").insert(chunk);
          if (error) {
            chunkError = error.message;
            break;
          }
          insertedCount += chunk.length;
        }

        if (chunkError) {
          toast.error(
            insertedCount > 0
              ? `Uploaded ${insertedCount} of ${proposalsToInsert.length} before failing: ${chunkError}`
              : chunkError
          );
        } else {
          toast.success(`Successfully uploaded ${insertedCount} proposals!`);
          if (fileInputRef.current) fileInputRef.current.value = "";
          router.refresh();
          await refreshProposals();
        }

        setBulkLoading(false);
      },
      error: (error) => {
        toast.error(`CSV Parsing error: ${error.message}`);
        setBulkLoading(false);
      }
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = proposals.length > 0 && selectedIds.size === proposals.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(proposals.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleteLoading(true);

    const ids = [...selectedIds];
    const { error } = await supabase.from("proposals").delete().in("id", ids);

    if (error) {
      toast.error(error.message || "Failed to delete selected proposals");
      setDeleteLoading(false);
      return;
    }

    toast.success(`Deleted ${ids.length} proposal(s)`);
    setProposals((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setConfirmDeleteOpen(false);
    setDeleteLoading(false);
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-6)", maxWidth: 1024, margin: "0 auto" }}>
      <div>
        <h2 style={{ fontFamily: "var(--bw-font-heading)", fontSize: "var(--bw-fs-h1)", fontWeight: "var(--bw-fw-bold)" as any, lineHeight: "var(--bw-lh-tight)", color: "var(--bw-content-primary)" }}>Upload Proposals</h2>
        <p style={{ marginTop: "var(--bw-space-2)", fontSize: "var(--bw-fs-sm)", color: "var(--bw-content-secondary)" }}>
          Add team proposals for the evaluation portal via single entry or bulk CSV.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">

        <Card variant="flat">
          <CardHeader style={{ padding: "var(--bw-space-6) var(--bw-space-6) var(--bw-space-4)", borderBottom: "1px solid var(--bw-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bw-space-3)" }}>
              <Upload size={18} style={{ color: "var(--bw-content-tertiary)" }} />
              <CardTitle style={{ fontSize: "var(--bw-fs-h4)" }}>Single Upload</CardTitle>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "var(--bw-space-6)" }}>
            <form onSubmit={handleSingleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-4)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-2)" }}>
                <Label htmlFor="proposal-team-name">Team Name</Label>
                <div style={{ position: "relative" }}>
                  <Type size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--bw-content-disabled)", pointerEvents: "none" }} />
                  <Input
                    id="proposal-team-name"
                    placeholder="Team Innovators"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    style={{ paddingLeft: 36 }}
                    pill
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-2)" }}>
                <Label htmlFor="proposal-product-name">Product Name (Optional)</Label>
                <div style={{ position: "relative" }}>
                  <Package size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--bw-content-disabled)", pointerEvents: "none" }} />
                  <Input
                    id="proposal-product-name"
                    placeholder="Leave blank for auto-numbering..."
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    style={{ paddingLeft: 36 }}
                    pill
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-2)" }}>
                <Label htmlFor="proposal-description">Description</Label>
                <Textarea
                  id="proposal-description"
                  placeholder="A brief description of the team's proposal..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-2)" }}>
                <Label>Proposal PDF Link(s)</Label>
                {proposalUrls.map((url, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: "var(--bw-space-2)" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <FileText size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--bw-content-disabled)", pointerEvents: "none" }} />
                      <Input
                        placeholder={`https://drive.google.com/file/d/... (Link ${index + 1})`}
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...proposalUrls];
                          newUrls[index] = e.target.value;
                          setProposalUrls(newUrls);
                        }}
                        type="url"
                        required={index === 0}
                        style={{ paddingLeft: 36 }}
                        pill
                      />
                    </div>
                    {proposalUrls.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newUrls = proposalUrls.filter((_, i) => i !== index);
                          setProposalUrls(newUrls);
                        }}
                        style={{ flexShrink: 0, color: "var(--bw-content-secondary)" }}
                      >
                        <X size={16} />
                      </Button>
                    )}
                  </div>
                ))}

                {proposalUrls.length < 5 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProposalUrls([...proposalUrls, ""])}
                    style={{ alignSelf: "flex-start", marginTop: "var(--bw-space-1)", color: "var(--bw-content-secondary)" }}
                  >
                    <Plus size={14} style={{ marginRight: 6 }} /> Add another proposal link
                  </Button>
                )}
              </div>
              <Button
                id="proposal-submit"
                type="submit"
                disabled={loading}
                style={{ marginTop: "var(--bw-space-2)", width: "100%" }}
              >
                {loading && <Loader2 size={16} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />}
                {loading ? "Uploading..." : "Upload Proposal"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card variant="flat" style={{ alignSelf: "start" }}>
          <CardHeader style={{ padding: "var(--bw-space-6) var(--bw-space-6) var(--bw-space-4)", borderBottom: "1px solid var(--bw-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bw-space-3)" }}>
              <FileSpreadsheet size={18} style={{ color: "var(--bw-content-tertiary)" }} />
              <CardTitle style={{ fontSize: "var(--bw-fs-h4)" }}>Bulk CSV Upload</CardTitle>
            </div>
          </CardHeader>
          <CardContent style={{ padding: "var(--bw-space-6)", display: "flex", flexDirection: "column", gap: "var(--bw-space-6)" }}>

            <div style={{ borderRadius: "var(--bw-radius-md)", border: "1px solid var(--bw-border)", background: "var(--bw-chip)", padding: "var(--bw-space-4)" }}>
              <h3 style={{ fontWeight: "var(--bw-fw-medium)" as any, color: "var(--bw-content-primary)", marginBottom: "var(--bw-space-2)" }}>Instructions</h3>
              <ul style={{ fontSize: "var(--bw-fs-sm)", color: "var(--bw-content-secondary)", paddingLeft: "var(--bw-space-4)", marginBottom: "var(--bw-space-4)", display: "flex", flexDirection: "column", gap: "var(--bw-space-1)", listStyleType: "disc" }}>
                <li>Download the template below.</li>
                <li>Fill in the rows without modifying the header row.</li>
                <li>Mandatory fields: <span style={{ fontWeight: "var(--bw-fw-medium)" as any, color: "var(--bw-content-primary)" }}>team_name</span> and at least <span style={{ fontWeight: "var(--bw-fw-medium)" as any, color: "var(--bw-content-primary)" }}>drive_link_1</span>. You can include up to 5 links.</li>
                <li><span style={{ fontWeight: "var(--bw-fw-medium)" as any, color: "var(--bw-content-primary)" }}>product_name</span> and <span style={{ fontWeight: "var(--bw-fw-medium)" as any, color: "var(--bw-content-primary)" }}>description</span> are optional.</li>
                <li>Save as a .csv file and upload.</li>
              </ul>
              <Button
                variant="secondary"
                style={{ width: "100%" }}
                onClick={downloadTemplate}
              >
                <Download size={16} style={{ marginRight: 8 }} /> Download Demo Template
              </Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--bw-space-2)" }}>
              <Label>Select CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleBulkUpload}
                disabled={bulkLoading}
                style={{ cursor: "pointer" }}
                pill
              />
              {bulkLoading && <p style={{ fontSize: "var(--bw-fs-sm)", color: "var(--bw-content-disabled)", marginTop: "var(--bw-space-2)", display: "flex", alignItems: "center", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}><Loader2 size={16} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />Processing and uploading data...</p>}
            </div>

          </CardContent>
        </Card>

      </div>

      <Separator />

      {/* Manage Proposals */}
      <Card variant="flat">
        <CardHeader style={{ padding: "var(--bw-space-6) var(--bw-space-6) var(--bw-space-4)", borderBottom: "1px solid var(--bw-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--bw-space-3)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bw-space-3)" }}>
              <ListChecks size={18} style={{ color: "var(--bw-content-tertiary)" }} />
              <CardTitle style={{ fontSize: "var(--bw-fs-h4)" }}>Uploaded Proposals ({proposals.length})</CardTitle>
            </div>
            {selectedIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
                style={{ color: "var(--bw-negative)" }}
              >
                <Trash2 size={14} style={{ marginRight: 6 }} /> Delete Selected ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent style={{ padding: "var(--bw-space-0) var(--bw-space-6) var(--bw-space-6)" }}>
          <div style={{ overflowX: "auto", margin: "0 calc(var(--bw-space-6) * -1)" }}>
            <Table style={{ minWidth: 640 }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ paddingLeft: "var(--bw-space-6)", width: 40 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all proposals"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} style={{ height: 96, textAlign: "center", color: "var(--bw-content-disabled)" }}>
                      No proposals uploaded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  proposals.map((proposal) => (
                    <TableRow key={proposal.id}>
                      <TableCell style={{ paddingLeft: "var(--bw-space-6)" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${proposal.team_name}`}
                          checked={selectedIds.has(proposal.id)}
                          onChange={() => toggleSelected(proposal.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </TableCell>
                      <TableCell style={{ fontWeight: "var(--bw-fw-medium)" as any }}>
                        {proposal.team_name}
                      </TableCell>
                      <TableCell style={{ color: "var(--bw-content-secondary)" }}>
                        {proposal.product_name || "—"}
                      </TableCell>
                      <TableCell style={{ color: "var(--bw-content-secondary)", fontSize: "var(--bw-fs-sm)" }}>
                        {new Date(proposal.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={(open: boolean) => !open && setConfirmDeleteOpen(false)}>
        <DialogContent style={{ maxWidth: 400 }}>
          <DialogHeader>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--bw-space-3)", color: "var(--bw-negative)", marginBottom: "var(--bw-space-2)" }}>
              <AlertTriangle size={24} />
              <DialogTitle>Delete Proposals</DialogTitle>
            </div>
          </DialogHeader>
          <div style={{ padding: "0 var(--bw-space-6) var(--bw-space-4)" }}>
            <p style={{ fontSize: "var(--bw-fs-sm)", color: "var(--bw-content-primary)", lineHeight: "var(--bw-lh-base)" }}>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> selected proposal(s)?
            </p>
            <p style={{ fontSize: "var(--bw-fs-xs)", color: "var(--bw-content-tertiary)", marginTop: "var(--bw-space-4)", padding: "var(--bw-space-3)", background: "var(--bw-negative-bg)", borderRadius: "var(--bw-radius-sm)", border: "1px solid rgba(225, 25, 0, 0.1)" }}>
              <strong>Warning:</strong> This action is permanent and cannot be undone. All evaluations, assignments, and annotations tied to these proposals will also be removed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBulkDelete}
              disabled={deleteLoading}
              style={{ background: "var(--bw-negative)", color: "white" }}
            >
              {deleteLoading && <Loader2 size={16} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />}
              {deleteLoading ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
