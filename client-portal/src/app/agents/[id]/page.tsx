import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTierConfig, type PricingTier } from "@/lib/pricing-constants";
import { PauseToggle } from "./pause-toggle";
import { ScheduleEditor } from "./schedule-editor";
import { ConfigEditor } from "./config-editor";
import { DocumentUpload } from "./document-upload";
import { ToolRequestForm } from "./tool-request-form";

export const dynamic = "force-dynamic";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-zinc-400",
    pending_approval: "bg-amber-500",
    killed: "bg-red-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-zinc-300"}`} />;
}

function parseDocuments(memoryObject: string): Array<{ filename: string; uploadedAt: string }> {
  try {
    const parsed = JSON.parse(memoryObject);
    if (Array.isArray(parsed.documents)) return parsed.documents;
  } catch { /* encrypted or empty */ }
  return [];
}

export default async function AgentDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      purpose: true,
      agentType: true,
      status: true,
      schedule: true,
      tone: true,
      emailFrequency: true,
      digestHour: true,
      digestDayOfWeek: true,
      timezone: true,
      pricingTier: true,
      interactionCount: true,
      interactionLimit: true,
      overageCount: true,
      interactionResetAt: true,
      lastRunAt: true,
      totalTasksCompleted: true,
      clientMemoryObject: true,
      client: { select: { email: true, businessName: true } },
    },
  });

  if (!agent) notFound();
  if (agent.client.email !== user.email) notFound(); // treat cross-client access as 404

  const toolRequests = await prisma.toolRequest.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, toolName: true, reason: true, status: true, createdAt: true },
  });
  const toolRequestsForClient = toolRequests.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  const tier = getTierConfig(agent.pricingTier as PricingTier);
  const limit = agent.interactionLimit;
  const used = agent.interactionCount;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const overLimit = limit > 0 && used >= limit;

  const docs = parseDocuments(agent.clientMemoryObject);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb / back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition mb-4"
      >
        ← Back to overview
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-3">
          <div className="mt-1.5">
            <StatusDot status={agent.status} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{agent.name}</h1>
            <p className="text-base text-zinc-600 mt-1">{agent.purpose}</p>
            <p className="text-sm text-zinc-500 mt-1">
              {agent.agentType} · {tier.label} tier · {agent.client.businessName}
            </p>
          </div>
        </div>
        <PauseToggle agentId={agent.id} status={agent.status} />
      </div>

      {/* Usage + activity grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Interaction counter */}
        <div className="md:col-span-2 border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-medium text-zinc-900">Interactions this month</h2>
            <span className="text-sm text-zinc-500">
              {used.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "unlimited"}
            </span>
          </div>
          {limit > 0 && (
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  overLimit ? "bg-amber-500" : pct >= 90 ? "bg-amber-400" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-sm text-zinc-600">
            {overLimit && (
              <span className="text-amber-700">
                {agent.overageCount} over — billed at ${(tier.overageRateCents / 100).toFixed(2)} each
              </span>
            )}
            {!overLimit && limit > 0 && (
              <span>
                Overage rate after limit: ${(tier.overageRateCents / 100).toFixed(2)}/interaction
              </span>
            )}
            {agent.interactionResetAt && (
              <span className="ml-auto text-zinc-500">
                Resets {new Date(agent.interactionResetAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Activity snapshot */}
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <h2 className="text-base font-medium text-zinc-900 mb-2">Activity</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Tasks completed</dt>
              <dd className="font-medium text-zinc-900">{agent.totalTasksCompleted}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Last run</dt>
              <dd className="font-medium text-zinc-900">
                {agent.lastRunAt ? new Date(agent.lastRunAt).toLocaleDateString() : "Not yet"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Status</dt>
              <dd className="font-medium text-zinc-900 capitalize">{agent.status.replace("_", " ")}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Schedule */}
      <section className="mb-8">
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="mb-3">
            <h2 className="text-base font-medium text-zinc-900">Schedule</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              How often {agent.name} runs autonomously.
              {agent.status === "active" ? " Changes take effect immediately." : " Activates when agent is running."}
            </p>
          </div>
          <ScheduleEditor agentId={agent.id} initial={agent.schedule} />
        </div>
      </section>

      {/* Voice & email */}
      <section className="mb-8">
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="mb-3">
            <h2 className="text-base font-medium text-zinc-900">Voice & email</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              How {agent.name} writes to you, and how often emails land in your inbox.
            </p>
          </div>
          <ConfigEditor
            agentId={agent.id}
            initialTone={agent.tone}
            initialFrequency={agent.emailFrequency}
            initialDigestHour={agent.digestHour}
            initialDigestDayOfWeek={agent.digestDayOfWeek}
            agentTimezone={agent.timezone}
          />
        </div>
      </section>

      {/* Documents */}
      <section className="mb-8">
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="mb-3">
            <h2 className="text-base font-medium text-zinc-900">Documents</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Feed {agent.name} context — SOPs, brand guides, spreadsheets, whatever.
            </p>
          </div>
          <DocumentUpload agentId={agent.id} agentName={agent.name} initialDocs={docs} />
        </div>
      </section>

      {/* Tool requests */}
      <section className="mb-8">
        <div className="border border-zinc-200 rounded-lg px-4 py-3 bg-white">
          <div className="mb-3">
            <h2 className="text-base font-medium text-zinc-900">Need a new tool?</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              If {agent.name} needs to connect to something we don't already support, tell us — we'll handle it.
            </p>
          </div>
          <ToolRequestForm
            agentId={agent.id}
            agentName={agent.name}
            initialRequests={toolRequestsForClient}
          />
        </div>
      </section>
    </div>
  );
}
