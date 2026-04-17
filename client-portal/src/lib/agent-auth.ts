import { createClient } from "@/lib/supabase-server";
import prisma from "@/lib/db";

export type AgentAuthResult =
  | { ok: true; agentId: string; clientId: string; userEmail: string }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * Verify the logged-in portal user owns `agentId`.
 * Returns `{ ok: true, ... }` on success, or a typed failure with HTTP status.
 * Callers translate failures into NextResponse.json(..., { status }).
 */
export async function verifyAgentOwnership(agentId: string): Promise<AgentAuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, status: 401, error: "Unauthorized" };

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientId: true, client: { select: { email: true } } },
  });

  if (!agent) return { ok: false, status: 404, error: "Agent not found" };
  if (agent.client.email !== user.email) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, agentId, clientId: agent.clientId, userEmail: user.email };
}

/** Oracle base URL — uses server-only ORACLE_URL, falls back to the public var. */
export function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://ambitt-agents-production.up.railway.app";
}
