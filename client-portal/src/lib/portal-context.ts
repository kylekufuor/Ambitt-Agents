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

export { describeSchedule, describeAgentStatus } from "./agent-presentation";
