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

/**
 * A round trip in words a person would use. "238 seconds" is arithmetic;
 * "4 minutes" is what you would say out loud, and this line exists to be
 * reassuring rather than precise.
 */
function humanDuration(ms: number): string {
  const secs = Math.max(1, Math.round(ms / 1000));
  if (secs < 60) return `${secs} ${secs === 1 ? "second" : "seconds"}`;
  const mins = Math.round(secs / 60);
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

export function VerificationPhoneCard({
  agentName,
  initial,
  confirmedAt,
  confirmedRoundTripMs,
  smsFrom,
  // Drops the panel and the heading when the card sits inside a collapsible
  // section, which already draws both. Rendering our own would give the
  // client the same title twice and a box inside a box.
  chromeless = false,
}: {
  agentName: string;
  initial: string | null;
  /** ISO timestamp of the last successful test, from the database. */
  confirmedAt?: string | null;
  confirmedRoundTripMs?: number | null;
  /** The number our texts come from, so they can save it before the first one. */
  smsFrom?: string | null;
  chromeless?: boolean;
}) {
  const [saved, setSaved] = useState<string | null>(initial);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!initial);
  // Unchecked by default, deliberately: a pre-ticked consent box is an instant
  // A2P rejection and is not consent in any case.
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The test round-trip. "waiting" is the interesting state: the text has gone
  // and we are watching for the reply, which is the only moment the client
  // learns anything they did not already believe.
  const [test, setTest] = useState<
    | { state: "idle" }
    | { state: "sending" }
    | { state: "waiting" }
    | { state: "arrived"; took: string }
    | { state: "timeout" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function sendTest() {
    setTest({ state: "sending" });
    const res = await fetch("/api/account/verification-phone/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTest({ state: "error", message: data.error ?? "That did not send. Try again." });
      return;
    }
    setTest({ state: "waiting" });

    // Poll while they go and find their phone. Five minutes, because two
    // assumed someone standing at their desk — the first real test came back
    // in four and the page had already given up and said it failed. The stored
    // confirmation below is the real safety net; this is just the live update.
    const started = Date.now();
    const deadline = started + 300_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await fetch("/api/account/verification-phone/test?poll=1", { method: "POST" });
      const d = await p.json().catch(() => ({}));
      if (d.replied) {
        setTest({ state: "arrived", took: humanDuration(d.roundTripMs ?? Date.now() - started) });
        return;
      }
    }
    setTest({ state: "timeout" });
  }

  async function save(next: string, withConsent: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/verification-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: next, consent: withConsent }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "That did not save. Try again.");
      setBusy(false);
      return;
    }
    setSaved(data.phone ?? null);
    setValue("");
    setConsent(false);
    setEditing(!data.phone);
    setBusy(false);
  }

  const Frame = chromeless ? "div" : "section";

  return (
    <Frame className={chromeless ? "" : "v3-panel p-[17px]"}>
      {!chromeless && (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[color:var(--text-3)]">
          Where login codes go
        </p>
      )}

      <p className={`text-[14px] text-[color:var(--text-2)] leading-relaxed max-w-[62ch] ${chromeless ? "" : "mt-2"}`}>
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
            onClick={() => save("", false)}
          >
            Remove
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={test.state === "sending" || test.state === "waiting"}
            onClick={sendTest}
          >
            {test.state === "sending"
              ? "Sending…"
              : test.state === "waiting"
                ? "Waiting for your reply…"
                : "Send me a test text"}
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
              disabled={busy || !value.trim() || !consent}
              onClick={() => save(value, consent)}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {saved && (
              <button className="btn btn-ghost" onClick={() => { setEditing(false); setValue(""); setError(""); }}>
                Cancel
              </button>
            )}
          </div>
          {/* The consent record the privacy policy promises. Its wording is
              the disclosure carriers look for: who sends, what kind of
              message, frequency, rates, and how to stop. */}
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer select-none max-w-[62ch]">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[color:var(--brand-solid)] cursor-pointer shrink-0"
            />
            <span className="text-[12.5px] text-[color:var(--text-2)] leading-relaxed">
              I agree to receive login-verification texts from Ambitt Agents at this number.
              Message frequency varies, and message and data rates may apply. Reply STOP to opt
              out or HELP for help. See our{" "}
              <a href="https://www.ambitt.agency/privacy" target="_blank" rel="noopener noreferrer"
                 className="text-[color:var(--brand-ink)] underline underline-offset-2">privacy policy</a>{" "}
              and{" "}
              <a href="https://www.ambitt.agency/terms" target="_blank" rel="noopener noreferrer"
                 className="text-[color:var(--brand-ink)] underline underline-offset-2">terms</a>.
            </span>
          </label>

          {error && <p className="text-[13px] text-[color:var(--red)] mt-2">{error}</p>}
        </div>
      )}

      {test.state !== "idle" && test.state !== "sending" && (
        <div className="mt-3 text-[13px] leading-relaxed">
          {test.state === "waiting" && (
            <p className="text-[color:var(--text-2)]">
              Sent. Reply to it with anything at all and this will update.
            </p>
          )}
          {test.state === "arrived" && (
            <p className="text-[color:var(--emerald)] font-semibold">
              Got your reply in {test.took}. This number works.
            </p>
          )}
          {test.state === "timeout" && (
            <p className="text-[color:var(--amber)]">
              No reply yet. If you have already replied you can leave this page. We record it either
              way, and this will say confirmed next time you look. If the text never arrived,
              the number may be wrong, so change it above and try again.
            </p>
          )}
          {test.state === "error" && <p className="text-[color:var(--red)]">{test.message}</p>}
        </div>
      )}

      {confirmedAt && test.state === "idle" && (
        <p className="mt-3 text-[13px] text-[color:var(--emerald)] font-semibold">
          Confirmed working on{" "}
          {new Date(confirmedAt).toLocaleDateString(undefined, { day: "numeric", month: "long" })}
          {typeof confirmedRoundTripMs === "number" &&
            ` \u00b7 you replied in ${humanDuration(confirmedRoundTripMs)}`}
          .
        </p>
      )}

      {smsFrom && (
        <p className="mt-3 text-[13px] text-[color:var(--text-2)] leading-relaxed max-w-[62ch]">
          Texts come from{" "}
          <span className="font-mono text-[color:var(--text)]">{prettyPhone(smsFrom)}</span>. Save it
          as {agentName}{" "}
          now, so your phone knows him before he ever needs to use it. A number your phone does not
          recognize gets a spam warning underneath it, which is the last thing you want on the one
          message asking you for a login code.
        </p>
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
    </Frame>
  );
}
