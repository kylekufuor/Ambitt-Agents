"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
    <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden mb-6">
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="w-9 h-9 rounded-lg bg-[#25D366] flex items-center justify-center text-white shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.353l-.999 3.648 3.9-1.023zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-zinc-900">WhatsApp</p>
            {initial.connected && !editing ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                Connected
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                Needs setup
              </span>
            )}
            <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100">⚡ Instant</span>
          </div>

          <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
            When {agentName} needs a verification code to sign in for you, it texts you here — reply
            with the code and it continues in seconds. Much faster than email.
          </p>

          {initial.connected && !editing ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-zinc-800 font-medium">{initial.whatsappNumber}</span>
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-[color:var(--brand,#00b3b3)] hover:underline"
              >
                Change
              </button>
              <button
                onClick={() => save(true)}
                disabled={pending}
                className="text-xs font-medium text-zinc-500 hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <input
                type="tel"
                inputMode="tel"
                placeholder="e.g. (918) 857-5961"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full max-w-xs text-sm rounded-md border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand,#00b3b3)]/30 focus:border-[color:var(--brand,#00b3b3)]"
              />
              <label className="flex items-start gap-2 text-xs text-zinc-600 max-w-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[#00b3b3]"
                />
                <span>
                  I agree to receive WhatsApp messages from my agent for verification and updates.
                  Standard message rates may apply.
                </span>
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => save(false)}
                  disabled={pending || !number.trim() || !consent}
                  className="text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md px-3 py-1.5 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Connect WhatsApp"}
                </button>
                {initial.connected && (
                  <button
                    onClick={() => setEditing(false)}
                    className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-2 py-1.5"
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
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="font-medium text-zinc-800">One-time step:</span> open WhatsApp and send{" "}
            <code className="px-1 py-0.5 rounded bg-white border border-zinc-200 text-[11px]">{joinText}</code>{" "}
            to <span className="font-medium">{initial.sandboxNumber}</span> so your agent can reach you.{" "}
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--brand,#00b3b3)] font-medium hover:underline whitespace-nowrap"
            >
              Open in WhatsApp →
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
