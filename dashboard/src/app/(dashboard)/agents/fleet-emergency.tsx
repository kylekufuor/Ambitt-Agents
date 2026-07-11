"use client";

import { pauseAllAction } from "./actions";

// The big red button: pause EVERY active agent at once (operator halt). Confirm
// first — this stops all clients' agents until each is resumed.
export function FleetEmergency({ activeCount }: { activeCount: number }) {
  return (
    <form
      action={pauseAllAction}
      onSubmit={(e) => {
        if (
          activeCount === 0 ||
          !confirm(
            `Pause ALL ${activeCount} active agent${activeCount === 1 ? "" : "s"} right now?\n\nEvery client's agent stops immediately — no emails, no runs — until you resume each one. Use this if something is going wrong across the fleet.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={activeCount === 0}
        className="inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-red-500/15 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <span className="text-base leading-none">&#9209;</span>
        Pause all active{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
    </form>
  );
}
