// Control-plane throttle handling (Pillar 1 follow-up).
//
// When a client tells their agent "send me fewer emails" / "too many" — a
// "throttle" control intent — we step the agent's email cadence one notch
// quieter instead of just replying. This module is pure: it computes the next
// (quieter) emailFrequency along the real ladder and produces the human-facing
// confirmation copy. No DB, no side effects — callers persist the result.
//
// The ladder mirrors Agent.emailFrequency in prisma/schema.prisma and the
// allow-set in oracle/index.ts:
//   "immediate" (busiest) -> "daily_digest" -> "weekly_digest" (quietest)

// Busiest -> quietest. Index 0 is the loudest cadence; the last entry is the
// floor we can't step past.
const LADDER = ["immediate", "daily_digest", "weekly_digest"] as const;

// Human phrase for each cadence — describes the NEW level a client lands on.
const LABELS: Record<string, string> = {
  immediate: "immediate replies",
  daily_digest: "one daily digest",
  weekly_digest: "a weekly digest",
};

function labelFor(freq: string): string {
  return LABELS[freq] ?? "immediate replies";
}

/**
 * Step the cadence one level quieter along the real ladder, flooring at the
 * quietest option.
 *
 * - Recognized non-floor value: returns the next quieter level (changed: true).
 * - Already at the quietest level: returns { changed: false, next: current }.
 * - Unrecognized value: treated as the busiest level and stepped down one notch
 *   (changed: true), so a bad/legacy value can't get stuck loud.
 *
 * `label` is always a human phrase for the NEW `next` level.
 */
export function nextThrottledFrequency(current: string): {
  changed: boolean;
  next: string;
  label: string;
} {
  const idx = LADDER.indexOf(current as (typeof LADDER)[number]);

  // Unrecognized -> treat as busiest, step down to the next quieter level.
  if (idx === -1) {
    const next = LADDER[1];
    return { changed: true, next, label: labelFor(next) };
  }

  // Already at the quietest level (the floor) -> no change.
  if (idx >= LADDER.length - 1) {
    return { changed: false, next: current, label: labelFor(current) };
  }

  const next = LADDER[idx + 1];
  return { changed: true, next, label: labelFor(next) };
}

/**
 * Friendly one-liner confirming the throttle outcome.
 *
 * - If we stepped down: acknowledges the new cadence and invites re-tuning.
 * - If already minimal: says so and offers a full pause as the next lever.
 */
export function throttleConfirmation(
  agentName: string,
  r: ReturnType<typeof nextThrottledFrequency>
): string {
  if (r.changed) {
    return `Got it — I'll dial back to ${r.label} from here on. Reply any time if you want me more or less often.`;
  }
  return `I'm already sending as little as I can — ${r.label}. Want me to pause entirely instead? Just say "pause".`;
}
