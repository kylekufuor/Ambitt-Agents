import prisma from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteEditor } from "./editor";
import { ConvertCard } from "./convert-card";
import { QuoteProgress } from "./quote-progress";
import { EmailDeliveryBadge } from "@/components/email-delivery-badge";

// Quote draft review page. Atlas drafts after PRD approval; Kyle reviews,
// edits the JSON if needed, hits Send → flips status to quote_sent and
// emails the prospect a teaser linking to /quotes/[token].
export const dynamic = "force-dynamic";

const ORACLE_BASE = process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
const PORTAL_BASE = process.env.CLIENT_PORTAL_URL ?? "https://client-portal-production-77a9.up.railway.app";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      id: true,
      token: true,
      contactName: true,
      businessName: true,
      email: true,
      status: true,
      prdData: true,
      prdApprovedAt: true,
      quoteDraft: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeniedAt: true,
      quoteDeniedReason: true,
      convertedClientId: true,
    },
  });

  // If converted, look up the scaffolded Agent for the convert-success card.
  const scaffoldedAgent = prospect?.convertedClientId
    ? await prisma.agent.findFirst({
        where: { clientId: prospect.convertedClientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, status: true },
      })
    : null;

  // Latest quote_teaser email send for this prospect — drives the delivery
  // badge. There can be multiple if Kyle re-sent the quote; pick the newest.
  const latestQuoteSend = prospect
    ? await prisma.emailSend.findFirst({
        where: {
          prospectId: prospect.id,
          emailType: "quote_teaser",
        },
        orderBy: { acceptedAt: "desc" },
        select: {
          status: true,
          acceptedAt: true,
          sentAt: true,
          deliveredAt: true,
          bouncedAt: true,
          complainedAt: true,
          delayedAt: true,
          bounceReason: true,
        },
      })
    : null;

  if (!prospect) notFound();

  const quoteHtmlUrl = `${ORACLE_BASE}/onboarding/prospects/${prospect.id}/quote-html`;
  const liveQuoteUrl = `${PORTAL_BASE}/quotes/${prospect.token}`;

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
            <Link href="/prospects" className="hover:text-foreground">Prospects</Link> · Quote
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {prospect.contactName ?? "(no name)"}
            {prospect.businessName && (
              <span className="text-muted-foreground font-normal"> · {prospect.businessName}</span>
            )}
          </h1>
          <div className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
            <span>{prospect.email}</span>
            <StatusChip status={prospect.status} />
          </div>
          <Status prospect={prospect} liveQuoteUrl={liveQuoteUrl} latestQuoteSend={latestQuoteSend} />
        </div>
      </div>

      {!prospect.prdApprovedAt && (
        <div className="bg-amber-500/8 border border-amber-500/30 rounded-xl px-5 py-4 text-sm text-amber-300">
          PRD must be approved before the quote can be drafted.
          <Link href={`/prospects/${prospect.id}/prd`} className="ml-2 underline">Go to PRD →</Link>
        </div>
      )}

      {prospect.prdApprovedAt && !prospect.quoteDraft && (
        <QuoteProgress
          prospectId={prospect.id}
          initialPrdApprovedAt={prospect.prdApprovedAt.toISOString()}
          initialQuoteDraftPresent={false}
        />
      )}

      {/* Convert + Scaffold card — shows when quote is accepted but not yet
          materialized into a Client + Agent. After conversion it flips to a
          success card with links to the new entities. */}
      {prospect.status === "accepted" && (
        <ConvertCard
          prospectId={prospect.id}
          convertedClientId={prospect.convertedClientId}
          scaffoldedAgent={scaffoldedAgent}
        />
      )}

      {prospect.quoteDraft && (
        <QuoteEditor
          prospectId={prospect.id}
          quoteHtmlUrl={quoteHtmlUrl}
          initialJson={JSON.stringify(prospect.quoteDraft, null, 2)}
          alreadySent={Boolean(prospect.quoteSentAt)}
          locked={Boolean(prospect.quoteAcceptedAt || prospect.quoteDeniedAt)}
        />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    quote_pending: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    quote_sent: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
    accepted: "bg-emerald-600/15 text-emerald-300 ring-emerald-500/30",
    quote_denied: "bg-red-500/10 text-red-400 ring-red-500/20",
  };
  const cls = styles[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex items-center text-[10.5px] font-medium px-2 py-0.5 rounded-full ring-1 ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Status({
  prospect,
  liveQuoteUrl,
  latestQuoteSend,
}: {
  prospect: {
    quoteSentAt: Date | null;
    quoteAcceptedAt: Date | null;
    quoteDeniedAt: Date | null;
    quoteDeniedReason: string | null;
  };
  liveQuoteUrl: string;
  latestQuoteSend: React.ComponentProps<typeof EmailDeliveryBadge>["emailSend"];
}) {
  if (prospect.quoteAcceptedAt) {
    return (
      <p className="text-emerald-400 text-sm mt-2">
        🎉 Quote accepted {timeAgo(prospect.quoteAcceptedAt)}. The deal is on. (Stripe wiring lands in Phase C.)
      </p>
    );
  }
  if (prospect.quoteDeniedAt) {
    return (
      <p className="text-amber-400 text-sm mt-2">
        Quote denied {timeAgo(prospect.quoteDeniedAt)}.
        {prospect.quoteDeniedReason && <> Reason: <span className="text-amber-300">{prospect.quoteDeniedReason}</span></>}
      </p>
    );
  }
  if (prospect.quoteSentAt) {
    return (
      <div className="text-blue-400 text-sm mt-2 flex items-center gap-2 flex-wrap">
        <span>Sent {timeAgo(prospect.quoteSentAt)}</span>
        <EmailDeliveryBadge emailSend={latestQuoteSend} fallbackSentAt={prospect.quoteSentAt} />
        <span>
          —{" "}
          <a href={liveQuoteUrl} target="_blank" rel="noreferrer" className="underline">
            view what they see ↗
          </a>
        </span>
      </div>
    );
  }
  return null;
}

function timeAgo(d: Date): string {
  const seconds = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
