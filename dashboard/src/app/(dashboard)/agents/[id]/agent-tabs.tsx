"use client";

import { useState, useRef } from "react";
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

interface DocumentItem {
  filename: string;
  uploadedAt: string;
}

interface SopItem {
  filename: string;
  uploadedAt: string;
  chars: number;
  preview: string;
}

const tabs = ["Outputs", "Conversations", "Documents", "Memory", "Config"] as const;
type Tab = (typeof tabs)[number];

export function AgentTabs({
  agentId,
  agentStatus,
  tasks,
  conversations,
  memoryEntries,
  documents,
  sops,
  config,
}: {
  agentId: string;
  agentStatus: string;
  tasks: TaskItem[];
  conversations: ConversationItem[];
  memoryEntries: MemoryEntry[];
  documents: DocumentItem[];
  sops: SopItem[];
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
      {active === "Documents" && <DocumentsTab agentId={agentId} documents={documents} sops={sops} />}
      {active === "Memory" && <MemoryTab entries={memoryEntries} />}
      {active === "Config" && <ConfigTab agentId={agentId} agentStatus={agentStatus} config={config} />}
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

// --- Documents Tab ---

function DocumentsTab({
  agentId,
  documents: initialDocs,
  sops,
}: {
  agentId: string;
  documents: DocumentItem[];
  sops: SopItem[];
}) {
  const [expandedSop, setExpandedSop] = useState<string | null>(null);
  const [docs, setDocs] = useState(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch(`${oracleUrl}/agents/${agentId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        setUploadResult(`Error: ${body.error ?? res.statusText}`);
      } else {
        const data = await res.json();
        const newDocs = data.documents as DocumentItem[];
        setDocs((prev) => [...prev, ...newDocs]);
        setUploadResult(`${newDocs.length} document(s) uploaded`);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (err) {
      setUploadResult(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Operating Manual — SOPs uploaded at scaffold time */}
      {sops.length > 0 && (
        <div className="bg-card border border-emerald-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 bg-emerald-500/[0.03]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-foreground font-semibold text-[15px]">Operating Manual</h3>
                <p className="text-muted-foreground text-xs mt-1">
                  Authoritative playbooks injected directly into the agent&apos;s system prompt as load-bearing instructions.
                </p>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 shrink-0">
                {sops.length} SOP{sops.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {sops.map((sop, i) => {
              const key = `${sop.filename}-${i}`;
              const isExpanded = expandedSop === key;
              return (
                <div key={key}>
                  <button
                    onClick={() => setExpandedSop(isExpanded ? null : key)}
                    className="w-full px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-foreground text-sm font-medium truncate">{sop.filename}</p>
                        <p className="text-muted-foreground/60 text-[11px] mt-0.5">
                          {sop.chars.toLocaleString()} chars
                          {sop.uploadedAt && new Date(sop.uploadedAt).getTime() > 0 && (
                            <> · uploaded {new Date(sop.uploadedAt).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <span className="text-muted-foreground/40 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="bg-background border border-border rounded-lg p-4">
                        <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider mb-2">
                          Preview (first 400 chars)
                        </p>
                        <pre className="text-muted-foreground text-xs whitespace-pre-wrap font-mono leading-relaxed">
                          {sop.preview}
                          {sop.chars > 400 && "…"}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-1">Upload Documents</h3>
        <p className="text-muted-foreground text-xs mb-4">
          SOPs, brand guidelines, sales decks, FAQs — anything that helps the agent understand the business. Supports PDF, DOCX, and text files.
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
            className="text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 file:cursor-pointer"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="text-xs font-semibold px-4 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        {uploadResult && (
          <p className={`text-xs mt-2 ${uploadResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
            {uploadResult}
          </p>
        )}
      </div>

      {/* Document list */}
      {docs.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border/40">
            {docs.map((doc, i) => (
              <div key={`${doc.filename}-${i}`} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-foreground text-sm font-medium">{doc.filename}</p>
                  <p className="text-muted-foreground/60 text-[11px] mt-0.5">
                    Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                  Stored
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="No documents uploaded yet" />
      )}
    </div>
  );
}

// --- Config Tab ---

const SCHEDULE_PRESETS: Array<{ label: string; value: string; description: string }> = [
  { label: "Every Monday 8am", value: "0 8 * * 1", description: "Weekly on Monday" },
  { label: "Every weekday 8am", value: "0 8 * * 1-5", description: "Mon–Fri" },
  { label: "Every day 8am", value: "0 8 * * *", description: "Daily" },
  { label: "Twice a week (Mon/Thu)", value: "0 8 * * 1,4", description: "Mon & Thu" },
  { label: "Every 6 hours", value: "0 */6 * * *", description: "4x daily" },
  { label: "Manual only", value: "manual", description: "No scheduled runs" },
];

function ConfigTab({ agentId, agentStatus, config }: { agentId: string; agentStatus: string; config: AgentConfig }) {
  const [schedule, setSchedule] = useState(config.schedule);
  const [customCron, setCustomCron] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";

  async function updateSchedule(newSchedule: string) {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`${oracleUrl}/agents/${agentId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: newSchedule }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }));
        setSaveResult(`Error: ${body.error}`);
      } else {
        setSchedule(newSchedule);
        setSaveResult("Schedule updated");
        setShowCustom(false);
      }
    } catch (err) {
      setSaveResult(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Schedule */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-1">Schedule</h3>
        <p className="text-muted-foreground text-xs mb-4">
          How often the agent runs autonomously.
          {agentStatus === "active" ? " Changes take effect immediately." : " Will activate when agent is approved."}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          {SCHEDULE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => updateSchedule(preset.value)}
              disabled={saving}
              className={`text-left p-3 rounded-lg border transition-colors ${
                schedule === preset.value
                  ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <p className={`text-xs font-medium ${schedule === preset.value ? "text-emerald-400" : "text-foreground"}`}>{preset.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
            </button>
          ))}
        </div>

        {/* Custom cron */}
        {!showCustom ? (
          <button onClick={() => setShowCustom(true)} className="text-xs text-muted-foreground hover:text-foreground transition">
            Custom cron expression...
          </button>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="e.g. 0 9 * * 1,3,5"
              className="flex-1 text-xs font-mono px-3 py-1.5 rounded-md bg-background border border-border text-foreground"
            />
            <button
              onClick={() => customCron && updateSchedule(customCron)}
              disabled={saving || !customCron}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <p className="text-[11px] text-muted-foreground font-mono">{schedule}</p>
          {saveResult && (
            <p className={`text-[11px] ${saveResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
              {saveResult}
            </p>
          )}
        </div>
      </div>

      {/* Identity & Behavior */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold text-[15px] mb-4">Identity & Behavior</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <ConfigField label="Personality" value={config.personality} />
          <ConfigField label="Autonomy Level" value={config.autonomyLevel} />
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
