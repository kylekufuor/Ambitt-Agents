import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "./billing-button";

export const dynamic = "force-dynamic";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-zinc-400",
    pending_approval: "bg-amber-500",
    killed: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? "bg-zinc-300"}`} />
  );
}

export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { email: user.email },
    include: {
      agents: {
        select: {
          id: true,
          name: true,
          agentType: true,
          purpose: true,
          status: true,
          schedule: true,
          lastRunAt: true,
          totalTasksCompleted: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold">No account found</h1>
          <p className="text-zinc-500 mt-2">
            Contact support@ambitt.agency if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold">{client.businessName}</h1>
          <p className="text-zinc-500 text-sm mt-1">Ambitt Client Portal</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-zinc-400 text-sm hover:text-zinc-600 transition"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Active Agents */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Your Agents</h2>
        <div className="space-y-3">
          {client.agents.map((agent) => (
            <div
              key={agent.id}
              className="border border-zinc-200 rounded-lg p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={agent.status} />
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-zinc-500 text-sm">{agent.purpose}</p>
                  </div>
                </div>
                <span className="text-zinc-400 text-xs capitalize">
                  {agent.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-3 flex gap-6 text-xs text-zinc-500">
                <span>Type: {agent.agentType}</span>
                <span>Tasks completed: {agent.totalTasksCompleted}</span>
                <span>
                  Last run:{" "}
                  {agent.lastRunAt
                    ? new Date(agent.lastRunAt).toLocaleDateString()
                    : "Not yet"}
                </span>
              </div>
            </div>
          ))}
          {client.agents.length === 0 && (
            <div className="border border-zinc-200 rounded-lg p-8 text-center text-zinc-500">
              No agents assigned yet. Your agent is being set up.
            </div>
          )}
        </div>
      </section>

      {/* Billing */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">Billing</h2>
        <div className="border border-zinc-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-500 text-sm">Status</p>
              <p className="font-medium capitalize">{client.billingStatus}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm">Billing email</p>
              <p className="font-medium">{client.billingEmail}</p>
            </div>
          </div>
          <div className="mt-4">
            <ManageBillingButton />
          </div>
        </div>
      </section>

      {/* Support */}
      <section>
        <div className="border border-zinc-200 rounded-lg p-5 text-center">
          <p className="text-zinc-500 text-sm">
            Questions? Email{" "}
            <a
              href="mailto:support@ambitt.agency"
              className="text-zinc-900 font-medium hover:underline"
            >
              support@ambitt.agency
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

