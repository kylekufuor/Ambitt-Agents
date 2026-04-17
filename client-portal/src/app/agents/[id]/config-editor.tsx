"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TONE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "conversational", label: "Conversational", description: "Warm, direct, friendly — contractions OK" },
  { value: "formal", label: "Formal", description: "Full professional language, no contractions" },
  { value: "brief", label: "Brief", description: "Extreme terseness, bullets, under 100 words" },
];

const FREQUENCY_OPTIONS: Array<{ value: string; label: string; description: string; soon?: boolean }> = [
  { value: "immediate", label: "Immediate", description: "Email after every run" },
  { value: "daily_digest", label: "Daily digest", description: "One email per day (coming soon)", soon: true },
  { value: "weekly_digest", label: "Weekly digest", description: "One email per week (coming soon)", soon: true },
];

export function ConfigEditor({
  agentId,
  initialTone,
  initialFrequency,
}: {
  agentId: string;
  initialTone: string;
  initialFrequency: string;
}) {
  const router = useRouter();
  const [tone, setTone] = useState(initialTone);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function update(key: "tone" | "emailFrequency", value: string) {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) {
        setResult(`Error: ${body.error ?? "Failed"}`);
      } else {
        if (key === "tone") setTone(value);
        else setFrequency(value);
        setResult("Saved");
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tone */}
      <div>
        <p className="text-sm font-medium text-zinc-900 mb-2">Tone</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("tone", opt.value)}
              disabled={saving}
              className={`text-left px-4 py-3 rounded-lg border transition ${
                tone === opt.value
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20"
                  : "border-zinc-200 hover:border-zinc-400"
              } disabled:opacity-50`}
            >
              <p className={`text-sm font-medium ${tone === opt.value ? "text-emerald-700" : "text-zinc-900"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Email frequency */}
      <div>
        <p className="text-sm font-medium text-zinc-900 mb-2">Email frequency</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("emailFrequency", opt.value)}
              disabled={saving || opt.soon}
              className={`text-left px-4 py-3 rounded-lg border transition ${
                frequency === opt.value
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20"
                  : "border-zinc-200 hover:border-zinc-400"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${frequency === opt.value ? "text-emerald-700" : "text-zinc-900"}`}>
                  {opt.label}
                </p>
                {opt.soon && (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">
                    Soon
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {result && (
        <p className={`text-sm ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
