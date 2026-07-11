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

const AUTONOMY_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "supervised", label: "Supervised", description: "Agent shows the plan and waits for your approval before acting" },
  { value: "autonomous", label: "Autonomous", description: "Agent acts directly on routine work; asks only for high-impact actions" },
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
  initialAutonomyLevel,
  agentTimezone,
}: {
  agentId: string;
  initialTone: string;
  initialFrequency: string;
  initialDigestHour: number;
  initialDigestDayOfWeek: number;
  initialAutonomyLevel: string;
  agentTimezone: string;
}) {
  const router = useRouter();
  const [tone, setTone] = useState(initialTone);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [digestHour, setDigestHour] = useState(initialDigestHour);
  const [digestDayOfWeek, setDigestDayOfWeek] = useState(initialDigestDayOfWeek);
  const [autonomyLevel, setAutonomyLevel] = useState(initialAutonomyLevel);
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
        if ("autonomyLevel" in patch) setAutonomyLevel(patch.autonomyLevel as string);
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
  const isError = result?.startsWith("Error") ?? false;

  return (
    <div className="space-y-6">
      {/* Autonomy */}
      <Section label="Autonomy">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {AUTONOMY_OPTIONS.map((opt) => (
            <Opt
              key={opt.value}
              selected={autonomyLevel === opt.value}
              disabled={saving}
              onClick={() => update({ autonomyLevel: opt.value })}
              label={opt.label}
              desc={opt.description}
            />
          ))}
        </div>
      </Section>

      {/* Tone */}
      <Section label="Tone">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {TONE_OPTIONS.map((opt) => (
            <Opt
              key={opt.value}
              selected={tone === opt.value}
              disabled={saving}
              onClick={() => update({ tone: opt.value })}
              label={opt.label}
              desc={opt.description}
            />
          ))}
        </div>
      </Section>

      {/* Email frequency */}
      <Section label="Email frequency">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {FREQUENCY_OPTIONS.map((opt) => (
            <Opt
              key={opt.value}
              selected={frequency === opt.value}
              disabled={saving}
              onClick={() => update({ emailFrequency: opt.value })}
              label={opt.label}
              desc={opt.description}
            />
          ))}
        </div>
      </Section>

      {/* Digest cadence — only shown when frequency is a digest */}
      {showCadence && (
        <div className="rounded-[12px] bg-[color:var(--surface-2)] px-4 py-3.5 space-y-4">
          <p className="text-[13px] text-[color:var(--text-2)]">
            Digest sent at{" "}
            <span className="text-[color:var(--brand-hover)] font-medium">{formatHour(digestHour)}</span>
            {frequency === "weekly_digest" && (
              <>
                {" "}on{" "}
                <span className="text-[color:var(--brand-hover)] font-medium">
                  {DAY_OPTIONS.find((d) => d.value === digestDayOfWeek)?.label ?? "—"}
                </span>
              </>
            )}
            {agentTimezone && (
              <span className="text-[color:var(--text-4)]"> · {agentTimezone}</span>
            )}
          </p>

          {/* Hour picker */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-4)] mb-1.5">Hour</p>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {Array.from({ length: 24 }).map((_, h) => (
                <button
                  key={h}
                  onClick={() => update({ digestHour: h })}
                  disabled={saving}
                  className={`text-[11px] px-1 py-1.5 rounded-[8px] border transition disabled:opacity-50 ${
                    digestHour === h ? "chip-selected" : "chip"
                  }`}
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
              <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-4)] mb-1.5">Day of week</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => update({ digestDayOfWeek: d.value })}
                    disabled={saving}
                    className={`text-[11px] px-1 py-1.5 rounded-[8px] border transition disabled:opacity-50 ${
                      digestDayOfWeek === d.value ? "chip-selected" : "chip"
                    }`}
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
  );
}

/* -------------------------------------------------------------------------- */
/*  Presentational primitives                                                 */
/* -------------------------------------------------------------------------- */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--text-2)] mb-2.5">
        {label}
      </p>
      {children}
    </div>
  );
}

function Opt({
  selected,
  disabled,
  onClick,
  label,
  desc,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-[12px] border px-3.5 py-3 transition duration-150 disabled:opacity-50 ${
        selected
          ? "opt-selected -translate-y-px shadow-[0_6px_16px_-8px_rgba(0,164,189,0.5)]"
          : "opt hover:-translate-y-px"
      }`}
    >
      <p className={`text-[13.5px] font-medium ${selected ? "text-[color:var(--brand-hover)]" : "text-[color:var(--text)]"}`}>
        {label}
      </p>
      <p className="text-[12px] text-[color:var(--text-3)] mt-0.5 leading-snug">{desc}</p>
    </button>
  );
}
