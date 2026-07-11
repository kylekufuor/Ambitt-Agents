"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Small local duotone bolt for the "instant" badge — soft base + crisp mark +
// lit highlight, in the same layered style as the house icon set.
function BoltGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.2 2.5 5.4 12.4a.8.8 0 0 0 .63 1.3H10l-1.4 7.3a.5.5 0 0 0 .9.4l8-10.2a.8.8 0 0 0-.63-1.3H12.7l1.4-6.9a.5.5 0 0 0-.9-.5Z" fill="currentColor" opacity="0.22" />
      <path d="M13.6 2.2a.7.7 0 0 0-1.2.2l-1.5 7a.9.9 0 0 0 .88 1.1h2.9l-6.4 8.2a.5.5 0 0 1-.02-.02L9.5 12.1a.9.9 0 0 0-.88-1.08H6.4l6-7.6a.7.7 0 0 0-.02.02Z" fill="currentColor" />
      <path d="M12.6 3.6 7.2 10.4a.5.5 0 0 1-.8-.6l5.4-6.8a.4.4 0 0 1 .8.6Z" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

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
  const [consent, setConsent] = useState(initial.connected);
  const [editing, setEditing] = useState(!initial.connected);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sandboxDigits = (initial.sandboxNumber || "").replace(/[^\d]/g, "");
  const joinText = initial.sandboxJoinCode ? `join ${initial.sandboxJoinCode}` : "join";
  const waLink = `https://wa.me/${sandboxDigits}?text=${encodeURIComponent(joinText)}`;

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
        <div
          className="w-10 h-10 rounded-[11px] bg-[#25D366] flex items-center justify-center text-white shrink-0"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25), 0 2px 6px rgba(37,211,102,0.35)" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.353l-.999 3.648 3.9-1.023zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[color:var(--text)]">WhatsApp</p>
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
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--brand-hover)]">
              <BoltGlyph size={13} />
              Instant replies
            </span>
          </div>

          <p className="text-[12.5px] text-[color:var(--text-3)] mt-1.5 leading-relaxed max-w-[440px]">
            When {agentName}{" "}needs a verification code to sign in for you, it texts you here —
            just reply with the code and it&apos;s back to work in seconds. Much quicker than email.
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
              <input
                type="tel"
                inputMode="tel"
                placeholder="e.g. (918) 857-5961"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="field max-w-xs"
              />
              <label className="flex items-start gap-2.5 text-[12.5px] text-[color:var(--text-2)] max-w-md cursor-pointer leading-relaxed">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[color:var(--brand)]"
                />
                <span>
                  I agree to receive WhatsApp messages from my agent for verification and updates.
                  Standard message rates may apply.
                </span>
              </label>
              {error && <p className="text-[12.5px] text-[color:var(--red)]">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => save(false)}
                  disabled={pending || !number.trim() || !consent}
                  className="btn-primary text-[13px] px-3.5 py-1.5"
                >
                  {pending ? "Saving…" : "Connect WhatsApp"}
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

      {(!initial.connected || editing) && (
        <div className="px-4 py-3.5" style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
          <p className="text-[12.5px] text-[color:var(--text-2)] leading-relaxed">
            <span className="font-semibold text-[color:var(--text)]">One-time step:</span> open WhatsApp and send{" "}
            <code
              className="px-1.5 py-0.5 rounded text-[11.5px] font-mono text-[color:var(--text)]"
              style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1px var(--border)" }}
            >{joinText}</code>{" "}
            to <span className="font-semibold text-[color:var(--text)]">{initial.sandboxNumber}</span> so {agentName}{" "}can reach you.{" "}
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--brand-hover)] font-medium hover:underline whitespace-nowrap"
            >
              Open in WhatsApp →
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
