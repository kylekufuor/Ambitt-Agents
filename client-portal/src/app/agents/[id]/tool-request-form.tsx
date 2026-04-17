"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
    <div className="space-y-3">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setResult(null); }}
          className="h-9 px-4 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition"
        >
          Request a tool
        </button>
      ) : (
        <div className="border border-zinc-200 rounded-lg px-4 py-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-900 mb-1">
              Tool name
            </label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g. Notion, Airtable, internal CRM"
              maxLength={200}
              className="w-full h-9 px-3 rounded-md bg-white border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-900 mb-1">
              What do you want {agentName} to do with it?
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Short description helps us get the connection set up faster."
              className="w-full px-3 py-2 rounded-md bg-white border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              {reason.length}/2000
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={submitting || !toolName.trim() || !reason.trim()}
              className="h-9 px-4 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send request"}
            </button>
            <button
              onClick={() => { setOpen(false); setResult(null); }}
              disabled={submitting}
              className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`text-sm ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
          {result}
        </p>
      )}

      {requests.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">Previous requests</p>
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 py-2 px-3 rounded bg-zinc-50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{r.toolName}</p>
                <p className="text-xs text-zinc-500 line-clamp-1">{r.reason}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 whitespace-nowrap">
                <span className="capitalize">{r.status}</span>
                <span>·</span>
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
