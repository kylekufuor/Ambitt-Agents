"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const SCHEDULE_PRESETS: Array<{ label: string; value: string; description: string }> = [
  { label: "Every Monday 8am", value: "0 8 * * 1", description: "Weekly" },
  { label: "Every weekday 8am", value: "0 8 * * 1-5", description: "Mon–Fri" },
  { label: "Every day 8am", value: "0 8 * * *", description: "Daily" },
  { label: "Twice a week (Mon/Thu)", value: "0 8 * * 1,4", description: "Mon & Thu" },
  { label: "Every 6 hours", value: "0 */6 * * *", description: "4x daily" },
  { label: "Manual only", value: "manual", description: "No scheduled runs" },
];

export function ScheduleEditor({ agentId, initial }: { agentId: string; initial: string }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial);
  const [customCron, setCustomCron] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function updateSchedule(next: string) {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) {
        setResult(`Error: ${body.error ?? "Failed"}`);
      } else {
        setSchedule(next);
        setResult("Schedule updated");
        setShowCustom(false);
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSaving(false);
    }
  }

  const isError = result?.startsWith("Error") ?? false;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-3.5">
        {SCHEDULE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => updateSchedule(preset.value)}
            disabled={saving}
            className={`text-left rounded-[12px] border px-3.5 py-3 transition duration-150 disabled:opacity-50 ${
              schedule === preset.value
                ? "opt-selected -translate-y-px shadow-[0_6px_16px_-8px_rgba(0,164,189,0.5)]"
                : "opt hover:-translate-y-px"
            }`}
          >
            <p className={`text-[13.5px] font-medium ${schedule === preset.value ? "text-[color:var(--brand-hover)]" : "text-[color:var(--text)]"}`}>
              {preset.label}
            </p>
            <p className="text-[12px] text-[color:var(--text-3)] mt-0.5 leading-snug">{preset.description}</p>
          </button>
        ))}
      </div>

      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          className="text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition"
        >
          Set a custom cadence with our team…
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="e.g. 0 9 * * 1,3,5"
            className="field flex-1 font-mono"
          />
          <button
            onClick={() => customCron && updateSchedule(customCron)}
            disabled={saving || !customCron}
            className="btn-primary shrink-0 disabled:opacity-50"
          >
            Set
          </button>
          <button
            onClick={() => { setShowCustom(false); setCustomCron(""); }}
            className="text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition shrink-0 px-2"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3.5 text-[13px]">
        <span className="text-[color:var(--text-3)]">Current cadence</span>
        <span className="font-mono text-[color:var(--text-2)]">{schedule}</span>
        {result && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full ${
              isError
                ? "bg-[color:var(--red-tint)] text-[color:var(--red)]"
                : "bg-[color:var(--brand-tint)] text-[color:var(--brand-hover)]"
            }`}
          >
            {isError ? result : "✓ Saved"}
          </span>
        )}
      </div>
    </div>
  );
}
