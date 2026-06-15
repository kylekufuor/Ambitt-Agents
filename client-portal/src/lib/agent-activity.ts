import prisma from "@/lib/db";

/**
 * Email-activity helpers for the portal.
 *
 * Every email an agent sends is logged to EmailSend (recipient, subject,
 * delivery status, timestamps). This surfaces that to the client so they can
 * see exactly what their agent has done — how many emails, to whom, when, and
 * whether they landed.
 *
 * "Outreach" = email to a third party (not to the client themselves). Those
 * are what count against the daily outreach cap. Emails the agent sends *to*
 * the client (status updates, digests) are shown in the feed but tagged and
 * excluded from the outreach counts.
 */

export type SendItem = {
  id: string;
  to: string;
  subject: string;
  status: string;
  emailType: string | null;
  acceptedAt: Date;
  deliveredAt: Date | null;
  isToClient: boolean;
};

export type SendStats = {
  today: number; // outreach emails sent today (to third parties)
  week: number; // last 7 days
  month: number; // last 30 days
  recent: SendItem[];
};

export async function getSendStats(
  agentId: string,
  clientEmail: string,
  opts?: { take?: number }
): Promise<SendStats> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  // Outreach = sent to someone other than the client.
  const outreach = { agentId, to: { not: clientEmail } } as const;

  const [today, week, month, recentRows] = await Promise.all([
    prisma.emailSend.count({ where: { ...outreach, acceptedAt: { gte: startOfDay } } }),
    prisma.emailSend.count({ where: { ...outreach, acceptedAt: { gte: weekAgo } } }),
    prisma.emailSend.count({ where: { ...outreach, acceptedAt: { gte: monthAgo } } }),
    prisma.emailSend.findMany({
      where: { agentId },
      orderBy: { acceptedAt: "desc" },
      take: opts?.take ?? 25,
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        emailType: true,
        acceptedAt: true,
        deliveredAt: true,
      },
    }),
  ]);

  const ce = clientEmail.toLowerCase();
  return {
    today,
    week,
    month,
    recent: recentRows.map((r) => ({ ...r, isToClient: r.to.toLowerCase() === ce })),
  };
}

/** Friendly status label + presentation class for an EmailSend.status. */
export function sendStatusPresentation(status: string): { label: string; pill: string } {
  switch (status) {
    case "delivered":
      return { label: "Delivered", pill: "pill-emerald" };
    case "sent":
    case "accepted":
      return { label: "Sent", pill: "pill-blue" };
    case "delivery_delayed":
      return { label: "Delayed", pill: "pill-amber" };
    case "bounced":
      return { label: "Bounced", pill: "pill-red" };
    case "complained":
      return { label: "Spam-flagged", pill: "pill-red" };
    case "dropped":
      return { label: "Not sent", pill: "pill-red" };
    default:
      return { label: status, pill: "pill-muted" };
  }
}
