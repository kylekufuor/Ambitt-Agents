"use client";

import { useState } from "react";

interface OracleAction {
  id: string;
  actionType: string;
  description: string;
  status: string;
  agentId: string | null;
  clientId: string | null;
  createdAt: string;
}

const filterTabs = [
  { label: "All", value: "all" },
  { label: "Scaffolds", value: "scaffold_agent" },
  { label: "Alerts", value: "alert_kyle" },
  { label: "Health", value: "fleet_health_check" },
  { label: "Retries", value: "retry_agent" },
  { label: "Improvements", value: "improvement_cycle" },
] as const;

type FilterValue = (typeof filterTabs)[number]["value"];

const typeColors: Record<string, string> = {
  scaffold_agent: "text-blue-400 bg-blue-500/10",
  approval_request: "text-amber-400 bg-amber-500/10",
  alert_kyle: "text-red-400 bg-red-500/10",
  fleet_health_check: "text-muted-foreground bg-muted",
  kill_agent: "text-red-400 bg-red-500/10",
  retry_agent: "text-amber-400 bg-amber-500/10",
  improvement_cycle: "text-purple-400 bg-purple-500/10",
};

export function OracleActivityLog({ actions }: { actions: OracleAction[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = filter === "all" ? actions : actions.filter((a) => a.actionType === filter);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {filterTabs.map((tab) => {
          const count = tab.value === "all" ? actions.length : actions.filter((a) => a.actionType === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                filter === tab.value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground/60">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Actions list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length > 0 ? (
          <div className="divide-y divide-border/40">
            {filtered.map((action) => (
              <div key={action.id} className="px-5 py-3.5 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        typeColors[action.actionType] ?? "text-muted-foreground bg-muted"
                      }`}
                    >
                      {action.actionType}
                    </span>
                    <span className="text-muted-foreground text-sm truncate">{action.description}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {action.status === "failed" && (
                      <span className="text-[10px] font-semibold uppercase text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                        failed
                      </span>
                    )}
                    <span className="text-muted-foreground/40 text-[11px] tabular-nums whitespace-nowrap">
                      {new Date(action.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-muted-foreground/60 text-sm">No actions matching this filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
