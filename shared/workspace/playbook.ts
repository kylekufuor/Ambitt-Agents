import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "../db.js";
import { WorkspaceError } from "./safety.js";

export const proposalSchema = z.object({
  group: z.enum(["target", "outreach", "never", "stop"]),
  text: z.string().trim().min(1).max(600),
  reason: z.string().max(600),
  replacesRuleId: z.string().nullish(),
});
export async function proposeRule(
  clientId: string,
  agentId: string,
  input: unknown,
  source: { kind: string; ref?: string; quote?: string; at?: Date },
) {
  const p = proposalSchema.parse(input);
  if (
    p.replacesRuleId &&
    !(await prisma.playbookRule.findFirst({
      where: {
        id: p.replacesRuleId,
        clientId,
        agentId,
        status: "active",
        group: p.group,
      },
    }))
  )
    throw new WorkspaceError(
      "The original instruction changed. Review the latest Playbook before proposing its replacement.",
      409,
    );
  const key = createHash("sha256")
    .update(`${p.group}:${p.text.toLowerCase()}:${p.replacesRuleId ?? ""}`)
    .digest("hex");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${agentId}))::text`;
    const existing = await tx.playbookRule.findFirst({
      where: { agentId, proposedKey: key },
    });
    if (existing) return existing;
    return tx.playbookRule.create({
      data: {
        clientId,
        agentId,
        group: p.group,
        text: p.text,
        status: "proposed",
        sourceKind: source.kind,
        sourceRef: source.ref,
        sourceQuote: source.quote,
        sourceAt: source.at ?? new Date(),
        proposedKey: key,
        proposedReason: p.reason,
        supersedesId: p.replacesRuleId,
      },
    });
  });
}
