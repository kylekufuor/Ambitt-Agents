import { WatchRecords } from "@/components/workspace/records";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { V3Shell } from "@/components/v3-shell";
import { BillingOverview } from "@/components/billing-overview";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const client = await prisma.client.findUnique({
    where: { email: user.email },
    select: {
      businessName: true, billingEmail: true, billingStatus: true, stripeCustomerId: true,
      agents: {
        where: { status: { not: "killed" } }, orderBy: { createdAt: "asc" },
        select: {
          id: true, name: true, status: true, pricingTier: true, monthlyRetainerCents: true,
          setupFeeCents: true, interactionCount: true, interactionLimit: true,
        },
      },
    },
  });
  if (!client) redirect("/login");
  return <V3Shell user={{ email: user.email, name: client.businessName }} crumbs={[{ label: "Billing" }]}>
    <BillingOverview agents={client.agents} billingEmail={client.billingEmail} billingStatus={client.billingStatus} hasBillingAccount={!!client.stripeCustomerId} />
  <WatchRecords compact /></V3Shell>;
}
