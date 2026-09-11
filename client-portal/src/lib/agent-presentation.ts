/** Human-readable schedules only when every cron constraint is understood. */
export function describeSchedule(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, day, month, dow] = parts;
  if (day !== "*" || month !== "*" || !/^\d+$/.test(hour) || !/^\d+$/.test(minute)) return cron;
  const h = Number(hour), m = Number(minute);
  if (h > 23 || m > 59) return cron;
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  if (dow === "*") return `Every day at ${time}`;
  if (dow === "1-5") return `Weekdays at ${time}`;
  if (!/^[0-7](,[0-7])*$/.test(dow)) return cron;
  const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const days = [...new Set(dow.split(",").map(d => names[Number(d) % 7]))];
  return `${days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`} at ${time}`;
}

export function formatNextRun(value: Date | string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not yet scheduled";
  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" };
  try {
    return date.toLocaleString("en-US", { ...options, timeZone: timezone });
  } catch {
    return date.toLocaleString("en-US", { ...options, timeZone: "UTC" });
  }
}

export function describeAgentStatus(agent: {
  status: string; pausedBy: string | null; nextScheduledRun: Date | string | null; timezone: string;
}): { dot: string; label: string; line: string } {
  switch (agent.status) {
    case "active": return {
      dot: "var(--emerald)", label: "Active",
      line: agent.nextScheduledRun ? `Next run ${formatNextRun(agent.nextScheduledRun, agent.timezone)}.` : "Ready for your next email or scheduled run.",
    };
    case "paused": return agent.pausedBy === "client"
      ? { dot: "var(--text-4)", label: "Paused by you", line: "Your agent will not run until you resume them." }
      : { dot: "var(--text-4)", label: "On hold", line: "Your agent is not running. Contact us if you need help resuming work." };
    case "building":
    case "pending_approval": return { dot: "var(--blue)", label: "Getting set up", line: "Your agent is not running for you yet." };
    default: return { dot: "var(--text-4)", label: agent.status, line: "" };
  }
}
