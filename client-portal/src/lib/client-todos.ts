import prisma from "@/lib/db";

/* ---------------------------------------------------------------------------
   What this client still owes us — computed once, read everywhere.

   Three surfaces need to answer the same question: the notification bell, the
   red "Needs you" markers on individual sections, and the setup nudges on the
   home page. If each worked it out for itself they would drift, and a bell
   saying "1 thing" beside a page showing nothing is worse than having neither,
   because it teaches the client that the badge lies.

   The rule for what belongs here: it must be something THE CLIENT can act on.
   An agent we have paused is not a to-do — they cannot lift it, and putting it
   in the bell would be handing them a task with no door. That distinction is
   the whole difference between a to-do list and a status feed.

   Every item carries the exact href of the control that resolves it. A
   notification that tells you something is wrong and makes you hunt for the
   fix is only half a notification, and the hunt is where people give up.
   --------------------------------------------------------------------------- */

export type TodoUrgency = "required" | "suggested";

export interface ClientTodo {
  /** Stable id, so a future "dismiss" can remember one without matching on copy. */
  id: string;
  /** Imperative and specific: "Add your mobile number", not "Mobile number". */
  label: string;
  /** One line on why it matters, in the client's terms, not ours. */
  why: string;
  /** Where the thing actually gets done. */
  href: string;
  urgency: TodoUrgency;
}

export interface ClientTodos {
  items: ClientTodo[];
  /** Only required items count toward the badge — see the note in the bell. */
  requiredCount: number;
}

/**
 * Everything outstanding for the client behind `email`.
 *
 * Deliberately mirrors loadRail's data sources so the bell and the rail cannot
 * disagree: same credential/customTools comparison for tools, same pending
 * Recommendation count for approvals.
 */
export async function getClientTodos(email: string): Promise<ClientTodos> {
  const client = await prisma.client.findUnique({
    where: { email },
    select: {
      id: true,
      verificationPhone: true,
      agents: {
        where: { status: { not: "killed" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, customTools: true },
      },
    },
  });
  if (!client) return { items: [], requiredCount: 0 };

  const agent = client.agents[0] ?? null;

  const [approvals, credentials] = await Promise.all([
    agent
      ? prisma.recommendation.count({ where: { agentId: agent.id, status: "pending" } })
      : Promise.resolve(0),
    prisma.credential.count({
      where: { clientId: client.id, secretsEncrypted: { not: null } },
    }),
  ]);

  const items: ClientTodo[] = [];
  const name = agent?.name ?? "your agent";

  // Approvals first. This is the only item where the agent is actively waiting
  // — everything else is setup that can happen whenever — so it leads.
  if (approvals > 0) {
    items.push({
      id: "approvals",
      label: approvals === 1 ? "Answer one decision" : `Answer ${approvals} decisions`,
      why: `${name} has stopped and will not go ahead until you say.`,
      href: "/approvals",
      urgency: "required",
    });
  }

  // The mobile number. Required rather than suggested: without it the agent
  // cannot finish a sign-in that asks for a texted code, which is not a
  // preference but a dead end mid-task.
  if (!client.verificationPhone) {
    items.push({
      id: "verification-phone",
      label: "Add your mobile number",
      why: `So ${name} can text you a login code when a site asks for one, and finish signing in.`,
      href: "/agent/email",
      urgency: "required",
    });
  }

  const customTools = Array.isArray(agent?.customTools) ? (agent.customTools as unknown[]) : [];
  if (customTools.length > credentials) {
    const missing = customTools.length - credentials;
    items.push({
      id: "tools",
      label: missing === 1 ? "Connect one more tool" : `Connect ${missing} more tools`,
      why: `${name} cannot use a tool until the sign-in details are stored.`,
      href: "/agent/tools",
      urgency: "required",
    });
  }

  return {
    items,
    requiredCount: items.filter((i) => i.urgency === "required").length,
  };
}

/**
 * Is one specific to-do outstanding?
 *
 * Lets a page mark its own section red without re-deriving the rule. The
 * Email setup page asks for "verification-phone" rather than checking the
 * field itself, so the section and the bell can never disagree about whether
 * that number is missing.
 */
export function hasTodo(todos: ClientTodos, id: string): boolean {
  return todos.items.some((t) => t.id === id);
}
