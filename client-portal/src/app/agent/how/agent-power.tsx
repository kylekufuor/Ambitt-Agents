"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* ---------------------------------------------------------------------------
   Stop and start your own agent.

   The control belongs to the client, but not every pause does. Three actors
   can halt an agent and who halted decides who may lift it: a client may only
   lift their own pause, while an operator hold or a tripped safety seatbelt
   stays held until we clear it. That rule lives in Oracle and is enforced
   there — this component's job is to not lie about it.

   So when someone else holds the agent, there is NO resume button. Rendering
   one and letting the request come back 403 would be offering a control that
   cannot work, which is worse than not offering it: the client clicks, nothing
   happens, and now they distrust the whole page. They get the reason instead,
   and a way to reach us.

   Pausing has no confirm step. It is instant, reversible by the same person,
   and the consequence is spelled out next to the button — a dialog here would
   be ceremony around a decision that costs nothing to undo.
   --------------------------------------------------------------------------- */

type Props = {
  agentId: string;
  agentName: string;
  status: string;
  pausedBy: string | null;
};

export function AgentPower({ agentId, agentName, status, pausedBy }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isActive = status === "active";

  // Held by someone other than this client. Includes the null case: an older
  // pause with no recorded actor is not provably the client's, and guessing
  // in the permissive direction here is exactly the wrong way to be wrong.
  const heldByUs = isPaused && pausedBy !== "client";

  async function act(action: "pause" | "resume") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That did not go through. Try again in a moment?");
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setError("We could not reach your agent just then. Give it another go in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!isPaused && !isActive) return null;

  const working = busy || pending;

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
      {heldByUs ? (
        // The status line directly above already says he is on hold and that
        // we will start him again. Repeating it here would be the third time
        // on one panel; all this needs to add is a way to reach a human.
        <p className="text-[13px] text-[color:var(--text-2)] leading-relaxed">
          Need him sooner? Write to{" "}
          <a
            href="mailto:support@ambitt.agency"
            className="text-[color:var(--brand-ink)] underline underline-offset-2"
          >
            support@ambitt.agency
          </a>
          .
        </p>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-[color:var(--text-2)] leading-relaxed">
            {isPaused
              ? `${agentName} is not working while he is paused. Nothing is lost — he picks up where he left off.`
              : `Pausing stops ${agentName} sending anything until you start him again.`}
          </p>
          <button
            type="button"
            onClick={() => act(isPaused ? "resume" : "pause")}
            disabled={working}
            className={isPaused ? "btn-primary shrink-0" : "btn-secondary shrink-0"}
          >
            {working
              ? isPaused
                ? "Starting…"
                : "Pausing…"
              : isPaused
                ? `Start ${agentName}`
                : `Pause ${agentName}`}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[12.5px] text-[color:var(--red)] mt-2.5 leading-relaxed">{error}</p>
      )}
    </div>
  );
}
