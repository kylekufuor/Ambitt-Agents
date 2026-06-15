"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* -------------------------------------------------------------------------- */
/*  Friendly option sets — plain English, no cron strings, no jargon.         */
/* -------------------------------------------------------------------------- */

type Choice<T> = { value: T; label: string; desc: string; match?: (v: T) => boolean };

// Schedule presets map a friendly label → a cron string. Anything the agent
// already has that doesn't match a preset is shown as "Custom".
const RHYTHM: Choice<string>[] = [
  { value: "0 8 * * 1", label: "Once a week", desc: "Every Monday morning" },
  { value: "0 8 * * 1,4", label: "Twice a week", desc: "Monday & Thursday" },
  { value: "0 8 * * 1-5", label: "Every weekday", desc: "Mon–Fri mornings" },
  { value: "0 8 * * *", label: "Every day", desc: "Including weekends" },
  { value: "manual", label: "Only when I ask", desc: "No scheduled runs" },
];

const APPROVAL: Choice<string>[] = [
  {
    value: "supervised",
    label: "Check with me first",
    desc: "Shows you the plan and waits for your OK before sending anything.",
  },
  {
    value: "autonomous",
    label: "Run on its own",
    desc: "Handles routine work directly; only asks about big decisions.",
  },
];

const TONE: Choice<string>[] = [
  { value: "conversational", label: "Friendly", desc: "Warm and direct, like a teammate." },
  { value: "formal", label: "Professional", desc: "Polished, full sentences, no slang." },
  { value: "brief", label: "Brief", desc: "Short and to the point. Bullets." },
];

const UPDATES: Choice<string>[] = [
  { value: "immediate", label: "After every run", desc: "An email each time work happens." },
  { value: "daily_digest", label: "Daily summary", desc: "One roll-up email a day." },
  { value: "weekly_digest", label: "Weekly summary", desc: "One roll-up email a week." },
];

// Outreach volume — friendly presets plus an "unlimited" option (null).
const VOLUME: Choice<number | null>[] = [
  { value: 10, label: "Up to 10 a day", desc: "Steady and selective" },
  { value: 25, label: "Up to 25 a day", desc: "A healthy pipeline" },
  { value: 50, label: "Up to 50 a day", desc: "Aggressive outreach" },
  { value: null, label: "No daily limit", desc: "Send as many as make sense" },
];

// Follow-up cadence — encoded as the followUpDays array.
const FOLLOWUP: Choice<number[]>[] = [
  { value: [], label: "No follow-ups", desc: "One message, no nudges" },
  { value: [5], label: "Light", desc: "One nudge after 5 days" },
  { value: [3, 7], label: "Standard", desc: "Nudge at 3 and 7 days" },
  { value: [2, 5, 9], label: "Persistent", desc: "Nudge at 2, 5 and 9 days" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
function sameArr(a: number[], b: number[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function AgentSettings({
  agentId,
  agentName,
  agentTimezone,
  status,
  sentToday,
  initial,
}: {
  agentId: string;
  agentName: string;
  agentTimezone: string;
  status: string;
  sentToday: number;
  initial: {
    schedule: string;
    autonomyLevel: string;
    tone: string;
    emailFrequency: string;
    digestHour: number;
    digestDayOfWeek: number;
    maxEmailsPerDay: number | null;
    followUpDays: number[];
  };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [schedule, setSchedule] = useState(initial.schedule);
  const [autonomy, setAutonomy] = useState(initial.autonomyLevel);
  const [tone, setTone] = useState(initial.tone);
  const [frequency, setFrequency] = useState(initial.emailFrequency);
  const [digestHour, setDigestHour] = useState(initial.digestHour);
  const [digestDay, setDigestDay] = useState(initial.digestDayOfWeek);
  const [volume, setVolume] = useState<number | null>(initial.maxEmailsPerDay);
  const [followUp, setFollowUp] = useState<number[]>(initial.followUpDays);

  // Per-section transient status: "saving" | "saved" | error string | null
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ key: string; msg: string; err: boolean } | null>(null);

  async function save(key: string, endpoint: "config" | "schedule", patch: Record<string, unknown>) {
    setBusy(key);
    setFlash(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({ error: "Something went wrong" }));
      if (!res.ok) {
        setFlash({ key, msg: body.error ?? "Couldn't save", err: true });
        return false;
      }
      setFlash({ key, msg: "Saved", err: false });
      startTransition(() => router.refresh());
      return true;
    } catch {
      setFlash({ key, msg: "Network error — try again", err: true });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const scheduleIsCustom = !RHYTHM.some((r) => r.value === schedule);
  const showCadence = frequency !== "immediate";

  return (
    <div className="space-y-4">
      {/* Work rhythm */}
      <SettingCard
        title="Work rhythm"
        hint={`How often ${agentName} gets to work.${status === "active" ? " Changes apply right away." : ""}`}
        flash={flash?.key === "schedule" ? flash : null}
      >
        <OptionGrid cols={3}>
          {RHYTHM.map((opt) => (
            <Opt
              key={opt.value}
              selected={schedule === opt.value}
              busy={busy === "schedule"}
              onClick={() => {
                setSchedule(opt.value);
                save("schedule", "schedule", { schedule: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
          {scheduleIsCustom && (
            <Opt selected busy={false} onClick={() => {}} label="Custom" desc="Set by our team" />
          )}
        </OptionGrid>
      </SettingCard>

      {/* Approval style */}
      <SettingCard
        title="Approval style"
        hint={`Decide how much ${agentName} runs past you before acting.`}
        flash={flash?.key === "autonomy" ? flash : null}
      >
        <OptionGrid cols={2}>
          {APPROVAL.map((opt) => (
            <Opt
              key={opt.value}
              selected={autonomy === opt.value}
              busy={busy === "autonomy"}
              onClick={() => {
                setAutonomy(opt.value);
                save("autonomy", "config", { autonomyLevel: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </OptionGrid>
      </SettingCard>

      {/* Outreach volume */}
      <SettingCard
        title="Outreach volume"
        hint={`The most new emails ${agentName} will send in a single day. Replies and follow-ups don't count toward this.`}
        flash={flash?.key === "volume" ? flash : null}
      >
        <p className="text-[12.5px] text-[color:var(--text-3)] -mt-2 mb-3">
          {sentToday === 0
            ? `${agentName} hasn't sent any outreach today.`
            : `${agentName} has sent ${sentToday} ${sentToday === 1 ? "email" : "emails"} today${
                typeof volume === "number" ? ` of ${volume}` : ""
              }.`}
        </p>
        <OptionGrid cols={4}>
          {VOLUME.map((opt) => (
            <Opt
              key={String(opt.value)}
              selected={volume === opt.value}
              busy={busy === "volume"}
              onClick={() => {
                setVolume(opt.value);
                save("volume", "config", { maxEmailsPerDay: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </OptionGrid>
      </SettingCard>

      {/* Follow-up cadence */}
      <SettingCard
        title="Follow-ups"
        hint={`When someone doesn't reply, how persistently should ${agentName} follow up?`}
        flash={flash?.key === "followup" ? flash : null}
      >
        <OptionGrid cols={4}>
          {FOLLOWUP.map((opt) => (
            <Opt
              key={opt.label}
              selected={sameArr(followUp, opt.value)}
              busy={busy === "followup"}
              onClick={() => {
                setFollowUp(opt.value);
                save("followup", "config", { followUpDays: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </OptionGrid>
      </SettingCard>

      {/* Writing style */}
      <SettingCard
        title="Writing style"
        hint={`How ${agentName} sounds in the emails it sends on your behalf.`}
        flash={flash?.key === "tone" ? flash : null}
      >
        <OptionGrid cols={3}>
          {TONE.map((opt) => (
            <Opt
              key={opt.value}
              selected={tone === opt.value}
              busy={busy === "tone"}
              onClick={() => {
                setTone(opt.value);
                save("tone", "config", { tone: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </OptionGrid>
      </SettingCard>

      {/* Email updates to you */}
      <SettingCard
        title="Your updates"
        hint={`How often ${agentName} emails you to report on its work.`}
        flash={flash?.key === "frequency" ? flash : null}
      >
        <OptionGrid cols={3}>
          {UPDATES.map((opt) => (
            <Opt
              key={opt.value}
              selected={frequency === opt.value}
              busy={busy === "frequency"}
              onClick={() => {
                setFrequency(opt.value);
                save("frequency", "config", { emailFrequency: opt.value });
              }}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </OptionGrid>

        {showCadence && (
          <div className="mt-4 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-3.5">
            <p className="text-[13px] text-[color:var(--text-2)] mb-3">
              Sent at <span className="text-[color:var(--brand-hover)] font-medium">{formatHour(digestHour)}</span>
              {frequency === "weekly_digest" && (
                <>
                  {" "}on{" "}
                  <span className="text-[color:var(--brand-hover)] font-medium">{DAY_LABELS[digestDay]}</span>
                </>
              )}
              {agentTimezone && <span className="text-[color:var(--text-4)]"> · {agentTimezone}</span>}
            </p>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-4)] mb-1.5">Hour</p>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {Array.from({ length: 24 }).map((_, h) => (
                <button
                  key={h}
                  disabled={busy === "frequency"}
                  onClick={() => {
                    setDigestHour(h);
                    save("frequency", "config", { digestHour: h });
                  }}
                  className={`text-[11px] px-1 py-1.5 rounded-[8px] border transition ${
                    digestHour === h ? "chip-selected" : "chip"
                  } disabled:opacity-50`}
                >
                  {formatHour(h)}
                </button>
              ))}
            </div>
            {frequency === "weekly_digest" && (
              <>
                <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-4)] mt-3 mb-1.5">Day</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={d}
                      disabled={busy === "frequency"}
                      onClick={() => {
                        setDigestDay(i);
                        save("frequency", "config", { digestDayOfWeek: i });
                      }}
                      className={`text-[11px] px-1 py-1.5 rounded-[8px] border transition ${
                        digestDay === i ? "chip-selected" : "chip"
                      } disabled:opacity-50`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </SettingCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Presentational primitives                                                 */
/* -------------------------------------------------------------------------- */

function SettingCard({
  title,
  hint,
  flash,
  children,
}: {
  title: string;
  hint: string;
  flash: { msg: string; err: boolean } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[15px] font-medium text-[color:var(--text)]">{title}</h3>
          <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[520px]">{hint}</p>
        </div>
        {flash && (
          <span
            className={`text-[12px] shrink-0 mt-0.5 ${
              flash.err ? "text-[color:var(--red)]" : "text-[color:var(--brand-hover)]"
            }`}
          >
            {flash.err ? flash.msg : "✓ Saved"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function OptionGrid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const cls =
    cols === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : cols === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4";
  return <div className={`grid ${cls} gap-2.5`}>{children}</div>;
}

function Opt({
  selected,
  busy,
  onClick,
  label,
  desc,
}: {
  selected: boolean;
  busy: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`text-left rounded-[12px] border px-3.5 py-3 transition disabled:opacity-50 ${
        selected ? "opt-selected" : "opt"
      }`}
    >
      <p className={`text-[13.5px] font-medium ${selected ? "text-[color:var(--brand-hover)]" : "text-[color:var(--text)]"}`}>
        {label}
      </p>
      <p className="text-[12px] text-[color:var(--text-3)] mt-0.5 leading-snug">{desc}</p>
    </button>
  );
}
