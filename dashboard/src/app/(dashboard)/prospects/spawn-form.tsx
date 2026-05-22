"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Inline "spawn prospect" form on /prospects. Two fields, one submit. Atlas
// emails the prospect their personal /onboard/[token] link immediately —
// they fill the form when they click; the row appears in the list right away.

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SpawnProspectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const canSubmit = name.trim().length > 0 && EMAIL_RX.test(email.trim());

  async function submit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    const res = await fetch("/api/prospects/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    setSubmitting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? `Spawn failed (${res.status})`);
      return;
    }
    const verb = body.isNew ? "Created" : "Resumed";
    setSuccess(`${verb} prospect for ${email.trim()} — Atlas emailed them the link.`);
    setName("");
    setEmail("");
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/80 transition-colors"
      >
        + Add prospect
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 w-full max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-foreground">Add a prospect</div>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setSuccess(null); }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Atlas will email them their personal onboarding link right away. They'll appear
        in the list as <span className="text-foreground font-medium">discovery</span>;
        once they fill the form the status flips to <span className="text-foreground font-medium">discovery_complete</span> and Atlas drafts a proposal.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            placeholder="Jordan Williams"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500/60 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="jordan@theirbusiness.com"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500/60 disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit && !submitting) submit(); }}
          />
        </div>
      </div>

      {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
      {success && <div className="mt-3 text-xs text-emerald-400">{success}</div>}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || submitting || pending}
          className="text-xs font-semibold px-4 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
        >
          {submitting ? "Sending…" : "Spawn + email link"}
        </button>
      </div>
    </div>
  );
}
