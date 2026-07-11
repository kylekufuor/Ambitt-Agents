"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ToolsIcon } from "@/components/icons";

// Map a request's lifecycle status to a house pill + dot.
function requestPill(status: string): { pill: string; dot: string } {
  const s = status.toLowerCase();
  if (s === "approved" || s === "connected" || s === "done") return { pill: "pill-emerald", dot: "dot-emerald" };
  if (s === "declined" || s === "rejected") return { pill: "pill-muted", dot: "dot-muted" };
  return { pill: "pill-amber", dot: "dot-amber" }; // pending / in review
}

interface ToolRequestItem {
  id: string;
  toolName: string;
  reason: string;
  status: string;
  createdAt: string;
}

export function ToolRequestForm({
  agentId,
  agentName,
  initialRequests,
}: {
  agentId: string;
  agentName: string;
  initialRequests: ToolRequestItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toolName, setToolName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [requests, setRequests] = useState(initialRequests);
  const [, startTransition] = useTransition();

  async function submit() {
    if (!toolName.trim() || !reason.trim()) {
      setResult("Error: Tool name and reason are both required.");
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tool-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName, reason }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) {
        setResult(`Error: ${body.error ?? "Failed"}`);
      } else {
        setRequests((prev) => [
          {
            id: body.request.id,
            toolName: body.request.toolName,
            reason: body.request.reason,
            status: "pending",
            createdAt: body.request.createdAt,
          },
          ...prev,
        ]);
        setToolName("");
        setReason("");
        setOpen(false);
        setResult("Sent — the team will follow up.");
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setResult(null); }}
          className="btn-secondary"
        >
          <ToolsIcon size={16} />
          Request a tool
        </button>
      ) : (
        <div
          className="rounded-[8px] p-4 space-y-3.5"
          style={{ background: "var(--surface-2)", boxShadow: "inset 0 0 0 1px var(--border)" }}
        >
          <div>
            <label className="field-label">Tool name</label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g. Notion, Airtable, internal CRM"
              maxLength={200}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">
              What do you want {agentName}{" "}to do with it?
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A line or two on how you'd use it helps us get the connection set up faster."
              className="field resize-y"
            />
            <p className="field-help text-right">{reason.length}/2000</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={submitting || !toolName.trim() || !reason.trim()}
              className="btn-primary text-[13.5px] px-4 py-2"
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
            <button
              onClick={() => { setOpen(false); setResult(null); }}
              disabled={submitting}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`text-[13px] font-medium ${result.startsWith("Error") ? "text-[color:var(--red)]" : "text-[color:var(--emerald)]"}`}>
          {result}
        </p>
      )}

      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Previous requests</p>
          <div className="space-y-2">
            {requests.map((r) => {
              const p = requestPill(r.status);
              return (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 py-2.5 px-3.5 rounded-[7px]"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-[color:var(--text)] truncate">{r.toolName}</p>
                    <p className="text-[12.5px] text-[color:var(--text-3)] line-clamp-1">{r.reason}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`pill ${p.pill}`}>
                      <span className={`dot ${p.dot}`} />
                      {r.status}
                    </span>
                    <span className="text-[12px] text-[color:var(--text-4)] whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
