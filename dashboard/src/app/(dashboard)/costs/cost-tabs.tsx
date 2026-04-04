"use client";

import { useState } from "react";
import Link from "next/link";
import {
  centsToUsd,
  formatTokens,
  type ModelSummary,
  type AgentCostSummary,
  type ClientCostSummary,
} from "@/lib/costs";

const tabs = ["By Model", "By Agent", "By Client"] as const;
type Tab = (typeof tabs)[number];

export function CostTabs({
  byModel,
  byAgent,
  byClient,
}: {
  byModel: ModelSummary[];
  byAgent: AgentCostSummary[];
  byClient: ClientCostSummary[];
}) {
  const [active, setActive] = useState<Tab>("By Model");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active === tab
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === "By Model" && <ByModelTable data={byModel} />}
      {active === "By Agent" && <ByAgentTable data={byAgent} />}
      {active === "By Client" && <ByClientTable data={byClient} />}
    </div>
  );
}

function ByModelTable({ data }: { data: ModelSummary[] }) {
  if (data.length === 0) return <EmptyState message="No API usage this month" />;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Model</Th>
              <Th align="right">Calls</Th>
              <Th align="right">Input Tokens</Th>
              <Th align="right">Output Tokens</Th>
              <Th align="right">Cost (MTD)</Th>
              <Th align="right">% of Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.model} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-foreground">{row.label}</td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{row.callCount.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{formatTokens(row.inputTokens)}</td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{formatTokens(row.outputTokens)}</td>
                <td className="px-5 py-3.5 text-foreground tabular-nums font-medium text-right">{centsToUsd(row.costCents)}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/30" style={{ width: `${Math.min(row.pctOfTotal, 100)}%` }} />
                    </div>
                    <span className="text-muted-foreground tabular-nums text-xs w-12 text-right">{row.pctOfTotal.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ByAgentTable({ data }: { data: AgentCostSummary[] }) {
  if (data.length === 0) return <EmptyState message="No agents" />;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Agent</Th>
              <Th>Client</Th>
              <Th align="right">Calls</Th>
              <Th align="right">Cost (MTD)</Th>
              <Th align="right">Budget</Th>
              <Th>Burn</Th>
              <Th align="right">Projected</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const pct = row.budgetCents > 0 ? Math.min((row.costCents / row.budgetCents) * 100, 100) : 0;
              const projPct = row.budgetCents > 0 ? (row.projectedCents / row.budgetCents) * 100 : 0;
              const barColor = projPct >= 100 ? "bg-red-500" : projPct >= 80 ? "bg-amber-500" : "bg-emerald-500";

              return (
                <tr key={row.agentId} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-foreground">{row.agentName}</span>
                    <span className="text-muted-foreground/60 text-xs ml-2 font-mono">{row.agentType}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/clients/${row.clientId}`} className="text-muted-foreground hover:text-foreground transition-colors">
                      {row.clientName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{row.callCount.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-foreground tabular-nums font-medium text-right">{centsToUsd(row.costCents)}</td>
                  <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{centsToUsd(row.budgetCents)}</td>
                  <td className="px-5 py-3.5">
                    <div className="w-20">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5 text-right">
                        {pct.toFixed(0)}%
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{centsToUsd(row.projectedCents)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {row.overageCents > 0 ? (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
                        +{centsToUsd(row.overageCents)} OVER
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                        ON TRACK
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ByClientTable({ data }: { data: ClientCostSummary[] }) {
  if (data.length === 0) return <EmptyState message="No clients" />;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Client</Th>
              <Th align="right">Agents</Th>
              <Th align="right">Cost (MTD)</Th>
              <Th align="right">Retainer</Th>
              <Th align="right">Projected Cost</Th>
              <Th align="right">Margin</Th>
              <Th align="right">Margin %</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.clientId} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/clients/${row.clientId}`} className="font-medium text-foreground hover:text-emerald-400 transition-colors">
                    {row.businessName}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{row.agentCount}</td>
                <td className="px-5 py-3.5 text-foreground tabular-nums font-medium text-right">{centsToUsd(row.costCents)}</td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{centsToUsd(row.retainerCents)}</td>
                <td className="px-5 py-3.5 text-muted-foreground tabular-nums text-right">{centsToUsd(row.projectedCents)}</td>
                <td className="px-5 py-3.5 text-right">
                  <span className={`tabular-nums font-medium ${row.marginCents >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {row.marginCents >= 0 ? "+" : ""}{centsToUsd(row.marginCents)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums ${
                    row.marginPct >= 50
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                      : row.marginPct >= 0
                        ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
                        : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
                  }`}>
                    {row.marginPct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-5 py-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
