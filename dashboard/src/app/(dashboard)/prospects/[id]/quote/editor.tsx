"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  quoteHtmlUrl: string;
  initialJson: string;
  alreadySent: boolean;
  locked: boolean; // accepted/denied → read-only
}

// Quote editor: live preview iframe on top, JSON textarea below, action
// buttons on the right. v1 keeps editing as raw JSON since Kyle is technical;
// a structured per-field form is a later upgrade if/when other operators
// touch the dashboard.
//
// Save validates server-side (Zod via Oracle). Send flips status to
// quote_sent and emails the prospect.
export function QuoteEditor({ prospectId, quoteHtmlUrl, initialJson, alreadySent, locked }: Props) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [json, setJson] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Optional instructions Atlas applies as overrides when regenerating —
  // "increase the price by 30%", "tighten the scope items", etc.
  const [regenNotes, setRegenNotes] = useState("");

  // Bust iframe cache when we save so the preview reflects the new draft.
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (savedAt) {
      const t = setTimeout(() => setSavedAt(null), 2500);
      return () => clearTimeout(t);
    }
  }, [savedAt]);

  async function save(): Promise<boolean> {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      return false;
    }
    setSaving(true);
    const res = await fetch(`/api/prospects/${prospectId}/quote-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const issues = Array.isArray(body.issues)
        ? body.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ")
        : "";
      setError(`${body.error ?? `Save failed (${res.status})`}${issues ? ` — ${issues}` : ""}`);
      return false;
    }
    setSavedAt(Date.now());
    setPreviewKey((k) => k + 1);
    return true;
  }

  async function send() {
    if (!confirm("Send this quote to the prospect? They'll get an email immediately with a link to Approve or Deny.")) return;
    // Save any pending edits first, abort send if save fails.
    if (json.trim() !== initialJson.trim()) {
      const ok = await save();
      if (!ok) return;
    }
    setSending(true);
    setError(null);
    const res = await fetch(`/api/prospects/${prospectId}/quote-send`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Send failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  async function regenerate() {
    const notes = regenNotes.trim();
    const confirmMsg = notes
      ? `Regenerate the quote with your instructions applied?\n\n"${notes}"\n\nYour current edits will be overwritten with Atlas's fresh draft.`
      : "Regenerate the quote draft from scratch? Your current edits will be overwritten with Atlas's fresh draft from the PRD.";
    if (!confirm(confirmMsg)) return;
    setRegenerating(true);
    setError(null);
    const res = await fetch(`/api/prospects/${prospectId}/quote-regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notes ? { notes } : {}),
    });
    setRegenerating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Regen failed (${res.status})`);
      return;
    }
    setRegenNotes("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-5 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {locked
              ? "This quote is locked (accepted or denied). Edits disabled."
              : alreadySent
                ? "Quote already sent — edits update the live page the prospect sees."
                : "Edit the JSON below, then Send."}
          </span>
          {savedAt && <span className="text-emerald-400 text-xs">Saved ✓</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={regenNotes}
            onChange={(e) => setRegenNotes(e.target.value)}
            disabled={locked || saving || sending || regenerating}
            placeholder='Tell Atlas — e.g. "increase the price by 30%"'
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 w-72 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={regenerate}
            disabled={locked || saving || sending || regenerating}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
          >
            {regenerating ? "Regenerating…" : regenNotes.trim() ? "Regenerate with instructions" : "Regenerate from PRD"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={locked || saving || sending}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {!alreadySent && (
            <button
              type="button"
              onClick={send}
              disabled={locked || saving || sending}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send to prospect"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/8 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Preview */}
      <div>
        <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-1.5">Live preview · what the prospect will see</div>
        <iframe
          key={previewKey}
          ref={iframeRef}
          src={quoteHtmlUrl}
          title="Quote preview"
          className="w-full border border-border rounded-xl bg-white"
          style={{ height: 720 }}
        />
      </div>

      {/* JSON editor */}
      <div>
        <div className="text-muted-foreground text-[11px] uppercase tracking-wider mb-1.5">JSON · click Save to apply</div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          disabled={locked}
          spellCheck={false}
          className="w-full bg-[#0d0d0d] border border-border rounded-xl p-4 text-foreground font-mono text-[12.5px] leading-relaxed focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
          style={{ minHeight: 480 }}
        />
      </div>
    </div>
  );
}
