"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  convertedClientId: string | null;
  scaffoldedAgent: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
}

// Sits above the QuoteEditor on the dashboard quote page. Two states:
//   - Pre-conversion: "Convert + Scaffold" button. Clicking creates the
//     Client + Agent in pending_approval + emails the client a tools-handoff.
//   - Post-conversion: success card with links to the new Client + Agent.
//     Subtle reminder that Stripe wiring (Phase C) is deferred.
export function ConvertCard({ prospectId, convertedClientId, scaffoldedAgent }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    if (!confirm("Convert this prospect to a Client + scaffold the Agent in pending_approval? This sends the client a tools-handoff email immediately.")) return;
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/prospects/${prospectId}/convert`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Convert failed (${res.status})`);
      return;
    }
    startTransition(() => router.refresh());
  }

  if (convertedClientId && scaffoldedAgent) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-emerald-300 text-sm font-semibold mb-1">
              ✓ Converted — Client + Agent created
            </div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>
                Agent <span className="text-foreground font-medium">{scaffoldedAgent.name}</span>{" "}
                (<span className="font-mono text-[11px]">{scaffoldedAgent.email}</span>) is in{" "}
                <span className="text-amber-400 font-medium">{scaffoldedAgent.status}</span>.
              </div>
              <div>Stripe billing wiring is deferred (Phase C) — manual handshake for this deal.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/clients/${convertedClientId}`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              View client →
            </Link>
            <Link
              href={`/agents/${scaffoldedAgent.id}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400"
            >
              Open agent →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-foreground text-sm font-semibold mb-1">
            Ready to convert?
          </div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Quote is accepted. Click <strong className="text-foreground">Convert + Scaffold</strong> to create
            the Client + Agent (in <span className="text-amber-400">pending_approval</span>) and email the
            client a tools-handoff link. Stripe wiring is deferred (Phase C) — this is a manual handshake.
          </div>
        </div>
        <button
          type="button"
          onClick={convert}
          disabled={submitting || pending}
          className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
        >
          {submitting ? "Converting…" : "Convert + Scaffold"}
        </button>
      </div>
      {error && (
        <div className="mt-3 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}
