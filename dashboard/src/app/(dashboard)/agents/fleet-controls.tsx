"use client";

import { pauseAgentAction, resumeAgentAction, killAgentAction, setCadenceAction, setSensitivityAction } from "./actions";

const CADENCE = [
  { value: "immediate", label: "Immediate" },
  { value: "daily_digest", label: "Daily" },
  { value: "weekly_digest", label: "Weekly" },
];

const SENSITIVITY = [
  { value: "relaxed", label: "Relaxed" },
  { value: "standard", label: "Standard" },
  { value: "strict", label: "Strict" },
];

// Per-agent operator controls, rendered in the fleet table. Reduce (cadence) is
// a submit-on-change select; Pause/Resume is status-driven; Stop (kill) is
// destructive and confirms first.
export function FleetControls({
  agentId,
  status,
  emailFrequency,
  safetySensitivity,
}: {
  agentId: string;
  status: string;
  emailFrequency: string;
  safetySensitivity: string | null;
}) {
  const controllable = status === "active" || status === "paused" || status === "building";

  if (status === "killed") {
    return <span className="text-red-400/50 text-[11px] uppercase tracking-wider">terminated</span>;
  }
  if (!controllable) {
    return <span className="text-muted-foreground/40 text-[11px]">—</span>;
  }

  const paused = status === "paused";

  return (
    <div className="flex items-center gap-1.5 justify-end whitespace-nowrap">
      {/* Reduce — cadence step, submit on change */}
      <form action={setCadenceAction} className="contents">
        <input type="hidden" name="agentId" value={agentId} />
        <select
          name="emailFrequency"
          defaultValue={emailFrequency}
          title="Reduce cadence — how often this agent emails the client"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="text-[11px] bg-muted text-muted-foreground border border-border rounded-md pl-2 pr-1 py-1 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
        >
          {CADENCE.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </form>

      {/* Safety sensitivity — scales the seatbelt caps + spike thresholds */}
      <form action={setSensitivityAction} className="contents">
        <input type="hidden" name="agentId" value={agentId} />
        <select
          name="safetySensitivity"
          defaultValue={safetySensitivity ?? "standard"}
          title="Safety sensitivity — Relaxed for a high-volume agent, Strict for one that should stay quiet"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="text-[11px] bg-muted text-muted-foreground border border-border rounded-md pl-2 pr-1 py-1 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
        >
          {SENSITIVITY.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </form>

      {/* Pause / Resume */}
      {paused ? (
        <form action={resumeAgentAction}>
          <input type="hidden" name="agentId" value={agentId} />
          <button
            type="submit"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            Resume
          </button>
        </form>
      ) : (
        <form action={pauseAgentAction}>
          <input type="hidden" name="agentId" value={agentId} />
          <button
            type="submit"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            Pause
          </button>
        </form>
      )}

      {/* Stop (kill) — destructive, confirm first */}
      <form
        action={killAgentAction}
        onSubmit={(e) => {
          if (!confirm("Stop this agent permanently (kill)? Its schedule is cancelled and it cannot run again. This can't be undone.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="agentId" value={agentId} />
        <button
          type="submit"
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors"
        >
          Stop
        </button>
      </form>
    </div>
  );
}
