import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";

/**
 * Every v3 page needs the same three things: who is logged in, which client
 * that is, and which agent the rail is talking about. Doing it once here keeps
 * the pages to their actual content and keeps the "which agent" rule in ONE
 * place — the rail and the pages must never disagree about that.
 */
export interface PortalContext {
  email: string;
  client: {
    id: string;
    businessName: string;
    email: string;
    billingEmail: string;
    contactName: string | null;
    preferredName: string | null;
    whatsappNumber: string | null;
    createdAt: Date;
  };
  agent: {
    id: string;
    name: string;
    email: string;
    status: string;
    pausedBy: string | null;
    pausedReason: string | null;
    schedule: string;
    timezone: string;
    tone: string;
    autonomyLevel: string;
    emailFrequency: string;
    maxEmailsPerDay: number | null;
    followUpDays: number[];
    clientDescription: string | null;
    lastRunAt: Date | null;
    nextScheduledRun: Date | null;
    customTools: unknown;
    communicationSettings: unknown;
  } | null;
}

export async function requirePortalContext(): Promise<PortalContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: {
      id: true, businessName: true, email: true, billingEmail: true,
      contactName: true, preferredName: true, whatsappNumber: true, createdAt: true,
      agents: {
        // Same rule as the rail: killed agents are gone, the first live one
        // owns the agent section. If these ever diverge the nav will point at
        // one agent while the page describes another.
        where: { status: { not: "killed" } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true, name: true, email: true, status: true,
          pausedBy: true, pausedReason: true, schedule: true, timezone: true,
          tone: true, autonomyLevel: true, emailFrequency: true,
          maxEmailsPerDay: true, followUpDays: true, clientDescription: true,
          lastRunAt: true, nextScheduledRun: true,
          customTools: true, communicationSettings: true,
        },
      },
    },
  });
  if (!client) redirect("/login");

  const { agents, ...rest } = client;
  return { email: user.email, client: rest, agent: agents[0] ?? null };
}

/** "0 8 * * 1" -> "Mondays at 8:00 am". Falls back to the raw cron. */
export function describeSchedule(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, , , dow] = parts;
  const h = Number(hour);
  const m = Number(min);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return cron;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  if (dow === "*") return `Every day at ${time}`;
  const list = dow
    .split(",")
    .map((d) => days[Number(d)] ?? null)
    .filter(Boolean);
  if (list.length === 0) return cron;
  if (list.length === 1) return `${list[0]} at ${time}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]} at ${time}`;
}

/** The agent's status as a client-facing sentence plus a dot colour. */
export function describeAgentStatus(a: NonNullable<PortalContext["agent"]>): {
  dot: string;
  label: string;
  line: string;
} {
  switch (a.status) {
    case "active":
      return {
        dot: "var(--emerald)",
        label: "Working",
        line: a.nextScheduledRun
          ? `Next run ${a.nextScheduledRun.toLocaleString("en-GB", {
              weekday: "long", hour: "numeric", minute: "2-digit", hour12: true,
            })}.`
          : "Running on his schedule.",
      };
    case "paused":
      // Who paused decides what the client can do about it.
      return a.pausedBy === "client"
        ? { dot: "var(--text-4)", label: "Paused by you", line: "He will not run until you start him again." }
        : {
            dot: "var(--text-4)",
            label: "Stopped by us",
            line: "We have him on hold while we check something. We will start him and let you know.",
          };
    case "building":
    case "pending_approval":
      return { dot: "var(--blue)", label: "Getting set up", line: "He is not running for you yet." };
    default:
      return { dot: "var(--text-4)", label: a.status, line: "" };
  }
}
