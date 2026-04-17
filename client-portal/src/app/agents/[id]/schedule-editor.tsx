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

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {SCHEDULE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => updateSchedule(preset.value)}
            disabled={saving}
            className={`text-left px-4 py-3 rounded-lg border transition ${
              schedule === preset.value
                ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20"
                : "border-zinc-200 hover:border-zinc-400"
            } disabled:opacity-50`}
          >
            <p className={`text-sm font-medium ${schedule === preset.value ? "text-emerald-700" : "text-zinc-900"}`}>
              {preset.label}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{preset.description}</p>
          </button>
        ))}
      </div>

      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          className="text-sm text-zinc-500 hover:text-zinc-900 transition"
        >
          Custom cron expression…
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="e.g. 0 9 * * 1,3,5"
            className="flex-1 h-9 px-3 rounded-md bg-white border border-zinc-300 text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
          />
          <button
            onClick={() => customCron && updateSchedule(customCron)}
            disabled={saving || !customCron}
            className="h-9 px-4 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50"
          >
            Set
          </button>
          <button
            onClick={() => { setShowCustom(false); setCustomCron(""); }}
            className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-900"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 text-sm">
        <span className="text-zinc-500">Current:</span>
        <span className="font-mono text-zinc-900">{schedule}</span>
        {result && (
          <span className={result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}>
            {result}
          </span>
        )}
      </div>
    </div>
  );
}
