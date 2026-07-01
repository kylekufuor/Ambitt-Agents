"use client";

import { useState } from "react";

/**
 * "Reach {agent}" — the one thing a client always needs and could never find:
 * the email address that actually lands in their agent's inbox.
 *
 * The address is the agent's real, memorable handle ({slug}@ambitt.agency) —
 * NOT the reply-{id}@ routing address. The owning client is authorised to email
 * it cold (inbound auth allows the owner on any path), so we can hand it over
 * as the front door. Copy-to-clipboard + a mail-client deep link, plus the two
 * house conventions worth knowing (reply to anything; DOCS subject for files).
 */
export function ReachAgent({
  agentName,
  agentEmail,
}: {
  agentName: string;
  agentEmail: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(agentEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the address is still visible to select manually */
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <div className="eyebrow mb-3">Reach {agentName}</div>

      {/* The address — the hero of this card */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={copy}
          title="Copy address"
          className="group flex items-center gap-2.5 min-w-0 text-left"
        >
          <span
            className="truncate font-mono text-[16px] md:text-[17px] text-[color:var(--text)] group-hover:text-[color:var(--brand-hover)] transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {agentEmail}
          </span>
          <span
            className={`shrink-0 text-[11px] font-medium tabular-nums transition-colors ${
              copied ? "text-[color:var(--emerald)]" : "text-[color:var(--text-4)] group-hover:text-[color:var(--brand-hover)]"
            }`}
          >
            {copied ? "Copied ✓" : "Copy"}
          </span>
        </button>

        <a href={`mailto:${agentEmail}`} className="btn-secondary sm:ml-auto shrink-0">
          Compose email
        </a>
      </div>

      {/* The two conventions worth knowing */}
      <p className="text-[13px] leading-relaxed text-[color:var(--text-3)] mt-4 max-w-[560px]">
        Email {agentName} here any time — a question, a task, a nudge. You can also
        just reply to any email {agentName} sends you; it all lands in the same place.
        To hand over a file, put{" "}
        <span
          className="font-mono text-[12px] px-1.5 py-0.5 rounded-[5px] bg-[color:var(--surface-2)] text-[color:var(--text-2)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          DOCS
        </span>{" "}
        in the subject line and {agentName} will add it to its knowledge.
      </p>
    </div>
  );
}
