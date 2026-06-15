"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Request a bigger change" — the scope boundary made friendly.
 *
 * The settings above are things the client can change themselves, for free.
 * Anything bigger — a new tool, a new kind of work, a different workflow —
 * goes through us so we can scope it and (if it grows the engagement) quote
 * it. This posts to the same tool-requests endpoint that logs the ask and
 * pings the team; a human picks it up from there.
 */
export function ChangeRequest({ agentId, agentName }: { agentId: string; agentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ msg: string; err: boolean } | null>(null);
  const [, startTransition] = useTransition();

  async function submit() {
    if (!title.trim() || !detail.trim()) {
      setResult({ msg: "Add a short title and a little detail.", err: true });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tool-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: title.trim(), reason: detail.trim() }),
      });
      const body = await res.json().catch(() => ({ error: "Something went wrong" }));
      if (!res.ok) {
        setResult({ msg: body.error ?? "Couldn't send", err: true });
        return;
      }
      setResult({ msg: "Got it — we'll be in touch shortly.", err: false });
      setTitle("");
      setDetail("");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setResult({ msg: "Network error — try again.", err: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="card p-5 md:p-6"
      style={{
        background: "linear-gradient(135deg, var(--brand-tint) 0%, var(--surface) 65%)",
        borderColor: "color-mix(in srgb, var(--brand) 20%, var(--border))",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-[15px] font-medium text-[color:var(--text)]">
            Need something bigger?
          </h3>
          <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[560px]">
            The settings above are yours to change anytime, free. For a new tool, a new
            kind of work, or a change to how {agentName}{" "}operates, tell us — we&apos;ll
            scope it and let you know if it affects your plan before anything changes.
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="btn-primary shrink-0 self-start sm:self-center whitespace-nowrap">
            Request a change
          </button>
        )}
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-[color:var(--border)] space-y-3">
          <div>
            <label className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--text-4)]">
              What do you need?
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Connect Arthur to my CRM"
              className="mt-1.5 w-full h-10 px-3.5 rounded-[10px] bg-[color:var(--surface)] border border-[color:var(--border)] text-[14px] text-[color:var(--text)] placeholder:text-[color:var(--text-4)] focus:outline-none focus:border-[color:var(--brand)]"
            />
          </div>
          <div>
            <label className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--text-4)]">
              A little more detail
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="What should change, and what are you trying to achieve?"
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-[10px] bg-[color:var(--surface)] border border-[color:var(--border)] text-[14px] text-[color:var(--text)] placeholder:text-[color:var(--text-4)] resize-y focus:outline-none focus:border-[color:var(--brand)]"
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? "Sending…" : "Send request"}
            </button>
            <button
              onClick={() => { setOpen(false); setResult(null); }}
              className="text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`text-[13px] mt-3 ${result.err ? "text-[color:var(--red)]" : "text-[color:var(--brand-hover)]"}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
}
