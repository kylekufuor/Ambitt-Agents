"use client";

import { useEffect, useState } from "react";

/**
 * "Things you can ask {agent}" — a short list of ready-to-send example emails,
 * grounded in what the agent actually does. Sits under the Reach card and
 * answers the client's next question after "what's the address?": "…and what
 * do I even say to it?"
 *
 * Cached examples arrive via `initial` (server-rendered, instant). If the agent
 * hasn't had any generated yet, `initial` is null and we lazy-fetch once — the
 * Oracle endpoint generates + caches, so it's slow only the very first time.
 * If generation yields nothing, the whole section hides itself.
 */

export interface ExampleEmail {
  capability: string;
  subject: string;
  body: string;
}

function mailto(to: string, subject: string, body: string) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ExampleEmails({
  agentId,
  agentName,
  agentEmail,
  initial,
}: {
  agentId: string;
  agentName: string;
  agentEmail: string;
  initial: ExampleEmail[] | null;
}) {
  const [examples, setExamples] = useState<ExampleEmail[] | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (initial !== null) return; // already have cached examples
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/example-emails`);
        const body = (await res.json().catch(() => ({}))) as { examples?: ExampleEmail[] };
        if (!cancelled) setExamples(Array.isArray(body.examples) ? body.examples : []);
      } catch {
        if (!cancelled) setExamples([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, initial]);

  async function copy(idx: number, subject: string, bodyText: string) {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${bodyText}`);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
    } catch {
      /* clipboard blocked — text is visible to select manually */
    }
  }

  // Nothing to show and nothing coming — hide the section entirely.
  if (!loading && (!examples || examples.length === 0)) return null;

  return (
    <section className="mt-10 reveal" style={{ ["--i" as never]: 2 }}>
      <h2 className="font-display text-[22px] text-[color:var(--text)] mb-1">
        Things you can ask {agentName}
      </h2>
      <p className="text-[13px] text-[color:var(--text-3)] mb-4 max-w-[560px]">
        Real emails you could send {agentName} right now — copy one, or hit send to
        open it in your mail app. Just examples; ask however you like.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 md:p-5">
              <div className="h-3 w-24 rounded bg-[color:var(--surface-2)] animate-pulse mb-3" />
              <div className="h-3.5 w-2/3 rounded bg-[color:var(--surface-2)] animate-pulse mb-2.5" />
              <div className="h-3 w-full rounded bg-[color:var(--surface-2)] animate-pulse" />
            </div>
          ))}
          <p className="text-[12px] text-[color:var(--text-4)]">
            Putting together a few ideas for {agentName}…
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {examples!.map((ex, idx) => (
            <div key={idx} className="card card-hover p-4 md:p-5">
              <div className="eyebrow mb-2">{ex.capability}</div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-medium text-[color:var(--text)] leading-snug">
                    {ex.subject}
                  </p>
                  <p className="text-[13px] text-[color:var(--text-3)] mt-1.5 leading-relaxed">
                    {ex.body}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3.5">
                <a
                  href={mailto(agentEmail, ex.subject, ex.body)}
                  className="text-[12.5px] font-medium text-[color:var(--brand-hover)] hover:underline"
                >
                  Send this →
                </a>
                <button
                  type="button"
                  onClick={() => copy(idx, ex.subject, ex.body)}
                  className={`text-[12.5px] font-medium transition-colors ${
                    copiedIdx === idx
                      ? "text-[color:var(--emerald)]"
                      : "text-[color:var(--text-4)] hover:text-[color:var(--text-2)]"
                  }`}
                >
                  {copiedIdx === idx ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
