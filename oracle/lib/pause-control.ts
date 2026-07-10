// ---------------------------------------------------------------------------
// Pause / resume authority (control-plane, Pillar 5)
// ---------------------------------------------------------------------------
// Agents can be paused by three actors, and WHO paused decides who may resume:
//   - A CLIENT may resume only an agent that a CLIENT paused.
//   - An OPERATOR may resume ANY pause.
//   - A "system" pause (a tripped safety seatbelt / runaway loop) and an
//     "operator" pause are operator-only to resume — a client cannot lift a
//     safety halt or an operator halt on their own.
//
// Pause precedence when halting an already-paused agent:
//   system(3) > operator(2) > client(1)
// A weaker halt must NOT downgrade a stronger existing pause (e.g. a client
// pause request against a system-halted agent is a no-op — the seatbelt wins).
//
// Pure helpers (pauseRank / canResume) are side-effect-free and unit-tested in
// pause-control.test.ts. haltAgent / resumeAgent take a minimal structural DB
// interface so the real PrismaClient satisfies it and tests can mock it.
// ---------------------------------------------------------------------------

export type PausedBy = "client" | "operator" | "system";

export interface ControlResult {
  ok: boolean;
  status: string;
  pausedBy?: PausedBy | null;
  message: string;
  noop?: boolean;
}

// Precedence rank for a pause actor. Higher wins.
export function pauseRank(by: PausedBy): number {
  switch (by) {
    case "system":
      return 3;
    case "operator":
      return 2;
    case "client":
      return 1;
  }
}

// Can `requester` resume an agent that was paused by `pausedBy`?
// Operators can always resume; clients only if a client paused it.
export function canResume(
  pausedBy: PausedBy | null,
  requester: "client" | "operator"
): boolean {
  if (requester === "operator") return true;
  return pausedBy === "client";
}

// Minimal structural DB interface — the real PrismaClient satisfies this shape,
// and tests supply an in-memory mock.
export interface PauseDb {
  agent: {
    findUnique(args: {
      where: { id: string };
      select?: any;
    }): Promise<{ status: string; pausedBy: string | null } | null>;
    update(args: { where: { id: string }; data: any }): Promise<unknown>;
  };
}

// Halt (pause) an agent. Respects pause precedence — a weaker halt never
// downgrades a stronger existing pause. Killed agents cannot be paused.
export async function haltAgent(
  db: PauseDb,
  args: { agentId: string; by: PausedBy; reason?: string }
): Promise<ControlResult> {
  const { agentId, by, reason } = args;
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { status: true, pausedBy: true },
  });

  if (!agent) {
    return { ok: false, status: "unknown", message: `Agent ${agentId} not found.` };
  }

  if (agent.status === "killed") {
    return { ok: false, status: "killed", message: "Agent is terminated; cannot pause." };
  }

  if (agent.status === "paused") {
    const existing = (agent.pausedBy as PausedBy | null) ?? null;
    // If we can't rank the existing actor (null/unknown), treat the new halt as
    // authoritative; otherwise only stronger-or-equal existing pauses hold.
    if (existing && pauseRank(existing) >= pauseRank(by)) {
      return {
        ok: true,
        noop: true,
        status: "paused",
        pausedBy: existing,
        message: `Agent already paused by ${existing}; ${by} halt did not downgrade it.`,
      };
    }
  }

  await db.agent.update({
    where: { id: agentId },
    data: {
      status: "paused",
      pausedBy: by,
      pausedReason: reason ?? null,
      pausedAt: new Date(),
    },
  });

  return {
    ok: true,
    status: "paused",
    pausedBy: by,
    message: `Agent paused by ${by}.`,
  };
}

// Resume an agent. Enforces resume authority based on who paused it.
export async function resumeAgent(
  db: PauseDb,
  args: { agentId: string; requester: "client" | "operator" }
): Promise<ControlResult> {
  const { agentId, requester } = args;
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { status: true, pausedBy: true },
  });

  if (!agent) {
    return { ok: false, status: "unknown", message: `Agent ${agentId} not found.` };
  }

  if (agent.status !== "paused") {
    return {
      ok: true,
      noop: true,
      status: agent.status,
      message: "Agent is not paused.",
    };
  }

  const pausedBy = (agent.pausedBy as PausedBy | null) ?? null;
  if (!canResume(pausedBy, requester)) {
    return {
      ok: false,
      status: "paused",
      pausedBy,
      message: `This agent was paused by ${pausedBy}; only an operator can resume it.`,
    };
  }

  await db.agent.update({
    where: { id: agentId },
    data: {
      status: "active",
      pausedBy: null,
      pausedReason: null,
      pausedAt: null,
    },
  });

  return {
    ok: true,
    status: "active",
    message: `Agent resumed by ${requester}.`,
  };
}
