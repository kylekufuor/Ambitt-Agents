"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TONE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "conversational", label: "Conversational", description: "Warm, direct, friendly — contractions OK" },
  { value: "formal", label: "Formal", description: "Full professional language, no contractions" },
  { value: "brief", label: "Brief", description: "Extreme terseness, bullets, under 100 words" },
];

const FREQUENCY_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "immediate", label: "Immediate", description: "Email after every run" },
  { value: "daily_digest", label: "Daily digest", description: "One roll-up email per day" },
  { value: "weekly_digest", label: "Weekly digest", description: "One roll-up email per week" },
];

const DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function ConfigEditor({
  agentId,
  initialTone,
  initialFrequency,
  initialDigestHour,
  initialDigestDayOfWeek,
  agentTimezone,
}: {
  agentId: string;
  initialTone: string;
  initialFrequency: string;
  initialDigestHour: number;
  initialDigestDayOfWeek: number;
  agentTimezone: string;
}) {
  const router = useRouter();
  const [tone, setTone] = useState(initialTone);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [digestHour, setDigestHour] = useState(initialDigestHour);
  const [digestDayOfWeek, setDigestDayOfWeek] = useState(initialDigestDayOfWeek);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) {
        setResult(`Error: ${body.error ?? "Failed"}`);
      } else {
        if ("tone" in patch) setTone(patch.tone as string);
        if ("emailFrequency" in patch) setFrequency(patch.emailFrequency as string);
        if ("digestHour" in patch) setDigestHour(patch.digestHour as number);
        if ("digestDayOfWeek" in patch) setDigestDayOfWeek(patch.digestDayOfWeek as number);
        setResult("Saved");
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSaving(false);
    }
  }

  const showCadence = frequency !== "immediate";

  return (
    <div className="space-y-6">
      {/* Tone */}
      <div>
        <p className="text-sm font-medium text-zinc-900 mb-2">Tone</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ tone: opt.value })}
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
              onClick={() => update({ emailFrequency: opt.value })}
              disabled={saving}
              className={`text-left px-4 py-3 rounded-lg border transition ${
                frequency === opt.value
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20"
                  : "border-zinc-200 hover:border-zinc-400"
              } disabled:opacity-50`}
            >
              <p className={`text-sm font-medium ${frequency === opt.value ? "text-emerald-700" : "text-zinc-900"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Digest cadence — only shown when frequency is a digest */}
      {showCadence && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 space-y-4">
          <p className="text-sm font-medium text-zinc-900">
            Digest sent at{" "}
            <span className="text-emerald-700">{formatHour(digestHour)}</span>
            {frequency === "weekly_digest" && (
              <>
                {" "}on{" "}
                <span className="text-emerald-700">
                  {DAY_OPTIONS.find((d) => d.value === digestDayOfWeek)?.label ?? "—"}
                </span>
              </>
            )}
            {agentTimezone && (
              <span className="text-zinc-500 font-normal"> ({agentTimezone})</span>
            )}
          </p>

          {/* Hour picker */}
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">Hour</p>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {Array.from({ length: 24 }).map((_, h) => (
                <button
                  key={h}
                  onClick={() => update({ digestHour: h })}
                  disabled={saving}
                  className={`text-xs px-1.5 py-1.5 rounded border transition ${
                    digestHour === h
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  } disabled:opacity-50`}
                  title={formatHour(h)}
                >
                  {formatHour(h)}
                </button>
              ))}
            </div>
          </div>

          {/* Day picker — only for weekly */}
          {frequency === "weekly_digest" && (
            <div>
              <p className="text-xs text-zinc-500 mb-1.5">Day of week</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => update({ digestDayOfWeek: d.value })}
                    disabled={saving}
                    className={`text-xs px-2 py-1.5 rounded border transition ${
                      digestDayOfWeek === d.value
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                    } disabled:opacity-50`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <p className={`text-sm ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
