"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChatIcon } from "@/components/icons";

// Apex legal pages the SMS consent language links to. Absolute URLs — the portal
// lives on a different origin (portal.ambitt.agency) than the marketing apex.
const PRIVACY_URL = "https://ambitt.agency/privacy";
const TERMS_URL = "https://ambitt.agency/terms";

// The mobile number is stored on Client.whatsappNumber (reused for the SMS relay).
// sandboxNumber / sandboxJoinCode remain in the payload for backward-compat but
// aren't shown — SMS needs no join step.
interface WhatsAppState {
  connected: boolean;
  whatsappNumber: string | null;
  sandboxNumber: string;
  sandboxJoinCode: string | null;
}

export function WhatsAppCard({
  agentId,
  agentName,
  initial,
}: {
  agentId: string;
  agentName: string;
  initial: WhatsAppState;
}) {
  const router = useRouter();
  const [number, setNumber] = useState(initial.whatsappNumber ?? "");
  // Consent is ALWAYS unchecked by default — carriers reject default-checked
  // opt-in, and every save records a fresh, explicit consent.
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(!initial.connected);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (removeIt = false) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          removeIt ? { whatsappNumber: "", consent: false } : { whatsappNumber: number, consent }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save — try again.");
        return;
      }
      if (removeIt) {
        setNumber("");
        setConsent(false);
        setEditing(true);
      } else {
        setEditing(false);
      }
      router.refresh();
    });

  return (
    <section className="card overflow-hidden mb-6">
      <div className="flex items-start gap-3.5 px-4 py-4">
        <span className="chip-icon chip-teal shrink-0 mt-0.5" aria-hidden="true">
          <ChatIcon size={20} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[color:var(--text)]">Text messages</p>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--text-3)]">SMS</span>
            {initial.connected && !editing ? (
              <span className="pill pill-emerald">
                <span className="dot dot-emerald" />
                Connected
              </span>
            ) : (
              <span className="pill pill-amber">
                <span className="dot dot-amber" />
                Needs setup
              </span>
            )}
          </div>

          <p className="text-[12.5px] text-[color:var(--text-3)] mt-1.5 leading-relaxed max-w-[440px]">
            When {agentName}{" "}needs a login-verification code to sign in for you, it sends a text
            to your mobile — just reply with the code and it&apos;s back to work in seconds. Much
            quicker than email.
          </p>

          {initial.connected && !editing ? (
            <div className="mt-3.5 flex items-center gap-3">
              <span className="text-[14px] text-[color:var(--text)] font-semibold">{initial.whatsappNumber}</span>
              <button
                onClick={() => setEditing(true)}
                className="text-[13px] font-medium text-[color:var(--brand-hover)] hover:underline"
              >
                Change
              </button>
              <button
                onClick={() => save(true)}
                disabled={pending}
                className="text-[13px] font-medium text-[color:var(--text-3)] hover:text-[color:var(--red)] disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="mt-3.5 space-y-3">
              <div>
                <label htmlFor="sms-number" className="field-label">Mobile number</label>
                <input
                  id="sms-number"
                  type="tel"
                  inputMode="tel"
                  placeholder="e.g. (918) 857-5961"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="field max-w-xs"
                />
              </div>

              <label className="flex items-start gap-2.5 text-[12.5px] text-[color:var(--text-2)] max-w-md cursor-pointer leading-relaxed">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[color:var(--brand)] w-4 h-4 shrink-0"
                />
                <span>
                  I agree to receive account and login-verification text messages from Ambitt Agents
                  (Kufgroup LLC) at this number. Message frequency varies and message &amp; data rates
                  may apply. Reply STOP to opt out, HELP for help. See our{" "}
                  <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-[color:var(--brand-hover)] font-medium hover:underline">Privacy Policy</a>{" "}
                  and{" "}
                  <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-[color:var(--brand-hover)] font-medium hover:underline">Terms</a>.
                </span>
              </label>

              {error && <p className="text-[12.5px] text-[color:var(--red)]">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => save(false)}
                  disabled={pending || !number.trim() || !consent}
                  className="btn-primary text-[13px] px-3.5 py-1.5"
                >
                  {pending ? "Saving…" : "Save number"}
                </button>
                {initial.connected && (
                  <button
                    onClick={() => setEditing(false)}
                    className="btn-ghost text-[13px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
