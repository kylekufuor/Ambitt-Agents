"use client";

import { useState } from "react";
import { centsToUsd } from "@/lib/costs";

interface TaskItem {
  id: string;
  taskType: string;
  description: string;
  status: string;
  rawOutput: string;
  createdAt: string;
  completedAt: string | null;
}

interface ConversationItem {
  id: string;
  role: string;
  content: string;
  channel: string;
  createdAt: string;
}

interface MemoryEntry {
  key: string;
  value: string;
}

interface AgentConfig {
  personality: string;
  schedule: string;
  autonomyLevel: string;
  tools: string[];
  primaryModel: string;
  analyticsModel: string;
  creativeModel: string;
  monthlyRetainerCents: number;
  setupFeeCents: number;
  budgetMonthlyCents: number;
  historyTier: string;
  clientNorthStar: string | null;
  approvalRate: number;
  implementationRate: number;
}

const tabs = ["Outputs", "Conversations", "Memory", "Config"] as const;
type Tab = (typeof tabs)[number];

export function AgentTabs({
  tasks,
  conversations,
  memoryEntries,
  config,
}: {
  tasks: TaskItem[];
  conversations: ConversationItem[];
  memoryEntries: MemoryEntry[];
  config: AgentConfig;
}) {
  const [active, setActive] = useState<Tab>("Outputs");

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

      {active === "Outputs" && <OutputsTab tasks={tasks} />}
      {active === "Conversations" && <ConversationsTab conversations={conversations} />}
      {active === "Memory" && <MemoryTab entries={memoryEntries} />}
      {active === "Config" && <ConfigTab config={config} />}
    </div>
  );
}

// --- Outputs Tab ---

function OutputsTab({ tasks }: { tasks: TaskItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (tasks.length === 0) return <EmptyState message="No task outputs yet" />;

  const statusColors: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    executing: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="divide-y divide-border/40">
        {tasks.map((task) => (
          <div key={task.id} className="hover:bg-muted/50 transition-colors">
            <button
              onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              className="w-full px-5 py-3.5 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-foreground font-mono text-xs shrink-0">{task.taskType}</span>
                  <span className="text-muted-foreground text-sm truncate">{task.description.slice(0, 80)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${statusColors[task.status] ?? "bg-muted text-muted-foreground"}`}>
                    {task.status}
                  </span>
                  <span className="text-muted-foreground/40 text-[11px] tabular-nums whitespace-nowrap">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground/40 text-xs">{expanded === task.id ? "▲" : "▼"}</span>
                </div>
              </div>
            </button>
            {expanded === task.id && (
              <div className="px-5 pb-4">
                <div className="bg-background border border-border rounded-lg p-4 text-sm">
                  <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider mb-2">Raw Output</p>
                  <pre className="text-muted-foreground text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                    {task.rawOutput}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Conversations Tab ---

function ConversationsTab({ conversations }: { conversations: ConversationItem[] }) {
  if (conversations.length === 0) return <EmptyState message="No conversations yet" />;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-5 space-y-3 max-h-[600px] overflow-y-auto">
        {[...conversations].reverse().map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "agent" ? "justify-start" : "justify-end"}`}
          >
            <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
              msg.role === "agent"
                ? "bg-muted text-foreground"
                : "bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/20"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {msg.role}
                </span>
                <span className="text-[10px] text-muted-foreground/40">{msg.channel}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1.5">
                {new Date(msg.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Memory Tab ---

function MemoryTab({ entries }: { entries: MemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
        <p className="text-muted-foreground text-sm">Memory is empty or encrypted</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Memory objects are populated as the agent learns about the client</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="divide-y divide-border/40">
        {entries.map((entry) => (
          <div key={entry.key} className="px-5 py-3.5">
            <p className="text-foreground text-sm font-medium font-mono">{entry.key}</p>
            <p className="text-muted-foreground text-sm mt-1 whitespace-pre-wrap">{entry.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Config Tab ---

function ConfigTab({ config }: { config: AgentConfig }) {
  return (
    <div className="space-y-4">
      {/* Identity & Behavior */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Identity & Behavior</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <ConfigField label="Personality" value={config.personality} />
          <ConfigField label="Autonomy Level" value={config.autonomyLevel} />
          <ConfigField label="Schedule" value={config.schedule} mono />
          <ConfigField label="History Tier" value={config.historyTier} />
          {config.clientNorthStar && (
            <ConfigField label="Client North Star" value={config.clientNorthStar} />
          )}
        </div>
      </div>

      {/* Model Routing */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Model Routing</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <ConfigField label="Primary (conversations)" value={config.primaryModel} mono />
          <ConfigField label="Analytics" value={config.analyticsModel} mono />
          <ConfigField label="Creative" value={config.creativeModel} mono />
        </div>
      </div>

      {/* Tools */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Tools</h3>
        <div className="flex flex-wrap gap-2">
          {config.tools.map((tool) => (
            <span key={tool} className="text-xs font-mono px-3 py-1.5 rounded-lg bg-muted text-foreground ring-1 ring-border">
              {tool}
            </span>
          ))}
        </div>
      </div>

      {/* Billing */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Billing</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <ConfigField label="Monthly Retainer" value={centsToUsd(config.monthlyRetainerCents)} />
          <ConfigField label="Setup Fee" value={centsToUsd(config.setupFeeCents)} />
          <ConfigField label="Budget (monthly)" value={centsToUsd(config.budgetMonthlyCents)} />
        </div>
      </div>

      {/* Performance */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Performance</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <ConfigField label="Approval Rate" value={`${(config.approvalRate * 100).toFixed(1)}%`} />
          <ConfigField label="Implementation Rate" value={`${(config.implementationRate * 100).toFixed(1)}%`} />
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground/60 text-[11px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-foreground text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-16 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
