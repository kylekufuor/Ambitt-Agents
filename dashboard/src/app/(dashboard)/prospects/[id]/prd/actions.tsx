"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  hasPRD: boolean;
  approved: boolean;
}

// Right-side controls for the PRD page. Two actions:
//   - Approve PRD → POSTs to /api/prospects/:id/prd-approve (sets prdApprovedAt)
//   - Regenerate with notes → POSTs to /api/prospects/:id/prd-regenerate
//     (kicks off Atlas re-run, clears the approval timestamp)
//
// Regen kicks off async — Atlas takes ~2 min — so we surface a "kicked off"
// state and tell the user to refresh in a moment.
export function PRDActions({ prospectId, hasPRD, approved }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [regenOpen, setRegenOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [regenKicked, setRegenKicked] = useState(false);

  if (!hasPRD) return null;

  async function approve() {
    setError(null);
    const res = await fetch(`/api/prospects/${prospectId}/prd-approve`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Approve failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function regenerate() {
    if (notes.trim().length === 0) {
      setError("Add at least one note so Atlas knows what to change.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/prospects/${prospectId}/prd-regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // 422 = Atlas's output failed validation; the body includes a `reason`
      // + `action` from Oracle that's more useful than the generic `error`.
      if (res.status === 422 && body.reason) {
        const action = body.action ? ` ${body.action}` : "";
        setError(`${body.error}. ${body.reason}${action}`);
      } else {
        setError(body.error ?? `Regen failed (${res.status})`);
      }
      return;
    }
    setRegenKicked(true);
    setNotes("");
    setRegenOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRegenOpen((v) => !v)}
          disabled={pending}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          {regenOpen ? "Cancel" : "Regenerate with notes"}
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={pending || approved}
          className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors ${
            approved
              ? "bg-emerald-500/15 text-emerald-400 cursor-default"
              : "bg-emerald-500 text-white hover:bg-emerald-400"
          }`}
        >
          {approved ? "Approved" : "Approve PRD"}
        </button>
      </div>

      {regenOpen && (
        <div className="bg-card border border-border rounded-lg p-3 w-[420px]">
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            What should Atlas change?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-background border border-border rounded-md px-2.5 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500/60"
            placeholder="e.g., add a 20-contacts/day cap; bump retainer to growth tier; the score function should penalize re-posted listings"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/90 text-white hover:bg-amber-500"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      {regenKicked && (
        <div className="text-xs text-amber-400 max-w-[420px] text-right">
          Atlas is regenerating (~2 min). You&apos;ll get an email when it&apos;s ready;
          refresh this page to see the updated PRD.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 max-w-[420px] text-right">{error}</div>
      )}
    </div>
  );
}
