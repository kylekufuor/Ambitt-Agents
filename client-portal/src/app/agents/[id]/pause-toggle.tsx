"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PauseToggle({ agentId, status }: { agentId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const isActive = status === "active";
  const canToggle = isPaused || isActive;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = isPaused ? "resume" : "pause";
      const res = await fetch(`/api/agents/${agentId}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }));
        setError(body.error ?? "Failed");
      } else {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canToggle) {
    return (
      <span className="text-sm text-zinc-500">
        {status === "pending_approval" ? "Pending approval" : "Unavailable"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={busy || pending}
        className={`h-9 px-4 rounded-md text-sm font-medium transition disabled:opacity-50 ${
          isPaused
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300"
        }`}
      >
        {busy ? "Working..." : isPaused ? "Resume agent" : "Pause agent"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
