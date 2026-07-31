"use client";

import { useState } from "react";
import { prettyPhone } from "@/lib/phone";

/* ---------------------------------------------------------------------------
   Where a login code gets texted.

   The copy does the important work here. We are asking a broker for his mobile
   so software can text him, which is a reasonable thing to be wary of, so the
   card states the single use plainly and says what it is NOT used for. If that
   ever stops being true, this copy has to change first.
   --------------------------------------------------------------------------- */

export function VerificationPhoneCard({
  agentName,
  initial,
}: {
  agentName: string;
  initial: string | null;
}) {
  const [saved, setSaved] = useState<string | null>(initial);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/verification-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "That did not save. Try again.");
      setBusy(false);
      return;
    }
    setSaved(data.phone ?? null);
    setValue("");
    setEditing(!data.phone);
    setBusy(false);
  }

  return (
    <section className="v3-panel p-[17px]">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
        Where login codes go
      </p>

      <p className="text-[14px] text-[color:var(--text-2)] mt-2 leading-relaxed max-w-[62ch]">
        When {agentName} signs in to a site on your behalf and it texts you a one time code, he
        needs it within a minute or the login expires. Email is too slow for that, so give him a
        mobile to text.
      </p>

      {saved && !editing ? (
        <div className="flex items-center gap-3 mt-3.5 flex-wrap">
          <span className="font-mono text-[14px] text-[color:var(--text)]">{prettyPhone(saved)}</span>
          <span className="pill pill-emerald">Set</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Change
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => save("")}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-3.5">
          <label className="field-label" htmlFor="vphone">Mobile number</label>
          <div className="flex gap-2.5 items-start flex-wrap">
            <input
              id="vphone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="field"
              style={{ maxWidth: 220 }}
              placeholder="(918) 555 0142"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={busy || !value.trim()}
              onClick={() => save(value)}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {saved && (
              <button className="btn btn-ghost" onClick={() => { setEditing(false); setValue(""); setError(""); }}>
                Cancel
              </button>
            )}
          </div>
          {error && <p className="text-[13px] text-[color:var(--red)] mt-2">{error}</p>}
        </div>
      )}

      {/* The scope promise. Concrete, and it names what this is NOT. */}
      <ul className="mt-4 space-y-1.5">
        {[
          "Only ever used to text you a login code, and only while he is signing in.",
          `${agentName} never texts you anything else, and we never use it for anything else.`,
          "He only asks for a code you were expecting, right after you saw the site send it.",
          "Remove it here whenever you like and he goes back to asking by email.",
        ].map((line) => (
          <li key={line} className="flex gap-2 text-[12.5px] text-[color:var(--text-3)] leading-relaxed">
            <span className="text-[color:var(--text-4)] shrink-0">·</span>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
