"use client";

import { useState, useActionState, startTransition } from "react";
import {
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Zap,
  ExternalLink,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAgentAction,
  type CreateAgentState,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioApp {
  name: string;
  key: string;
  description: string;
  categories: string[];
}

const AGENT_TYPES = [
  "analytics", "content", "marketing", "sales", "engagement",
  "support", "research", "design", "ops", "reputation", "custom",
];

const MAX_TOOLS = 3;
const STEPS = ["Basic Info", "Select Tools", "Connect", "Review"];

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------

export function CreateAgentForm({ composioApps }: { composioApps: ComposioApp[] }) {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");

  // Step 1 state
  const [agentName, setAgentName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [agentType, setAgentType] = useState("analytics");

  // Step 2 state
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Step 3 state
  const [connectionStatus, setConnectionStatus] = useState<
    Record<string, { status: "pending" | "connecting" | "connected" | "failed"; error?: string }>
  >({});

  // Step 4 state
  const [createState, createAction] = useActionState<CreateAgentState, FormData>(createAgentAction, {
    success: null,
    agentId: null,
    error: null,
  });

  // Filter apps by search
  const filteredApps = composioApps.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.key.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.categories.some((c) => c.toLowerCase().includes(q))
    );
  });

  // Navigation
  const canNext = () => {
    if (step === 0) return agentName.length >= 2 && clientEmail.includes("@") && businessName.length >= 2;
    if (step === 1) return selectedTools.length >= 1 && selectedTools.length <= MAX_TOOLS;
    if (step === 2) return true;
    return true;
  };

  const next = () => { if (canNext() && step < STEPS.length - 1) setStep(step + 1); };
  const back = () => { if (step > 0) setStep(step - 1); };

  // Tool selection
  const toggleTool = (toolKey: string) => {
    setSelectedTools((prev) => {
      if (prev.includes(toolKey)) {
        setConnectionStatus((c) => {
          const next = { ...c };
          delete next[toolKey];
          return next;
        });
        return prev.filter((id) => id !== toolKey);
      }
      if (prev.length >= MAX_TOOLS) return prev;
      setConnectionStatus((c) => ({
        ...c,
        [toolKey]: { status: "pending" },
      }));
      return [...prev, toolKey];
    });
  };

  // OAuth connect
  const connectTool = async (appKey: string) => {
    setConnectionStatus((prev) => ({ ...prev, [appKey]: { status: "connecting" } }));

    try {
      const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "";
      const res = await fetch(`${oracleUrl}/composio/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientEmail, // Composio entity = client email
          appName: appKey,
        }),
      });

      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();

      if (data.redirectUrl) {
        // Open OAuth popup
        const popup = window.open(data.redirectUrl, "composio_connect", "width=600,height=700");

        // Poll for popup close (OAuth complete)
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(timer);
            setConnectionStatus((prev) => ({
              ...prev,
              [appKey]: { status: "connected" },
            }));
          }
        }, 1000);
      } else {
        setConnectionStatus((prev) => ({ ...prev, [appKey]: { status: "connected" } }));
      }
    } catch (error) {
      setConnectionStatus((prev) => ({
        ...prev,
        [appKey]: { status: "failed", error: error instanceof Error ? error.message : "Connection failed" },
      }));
    }
  };

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                i === step
                  ? "bg-foreground text-background font-semibold"
                  : i < step
                    ? "text-emerald-400 cursor-pointer hover:bg-muted"
                    : "text-muted-foreground/40 cursor-default"
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i === step
                  ? "bg-background text-foreground"
                  : i < step
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-muted text-muted-foreground/40"
              }`}>
                {i < step ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight className={`size-4 mx-1 ${i < step ? "text-emerald-400/40" : "text-muted-foreground/20"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <BasicInfoStep
          agentName={agentName} setAgentName={setAgentName}
          clientEmail={clientEmail} setClientEmail={setClientEmail}
          businessName={businessName} setBusinessName={setBusinessName}
          businessDescription={businessDescription} setBusinessDescription={setBusinessDescription}
          agentType={agentType} setAgentType={setAgentType}
        />
      )}
      {step === 1 && (
        <ToolSelectionStep
          apps={filteredApps}
          totalCount={composioApps.length}
          selected={selectedTools}
          onToggle={toggleTool}
          search={search}
          setSearch={setSearch}
        />
      )}
      {step === 2 && (
        <ConnectStep
          apps={composioApps}
          selectedTools={selectedTools}
          connectionStatus={connectionStatus}
          onConnect={connectTool}
        />
      )}
      {step === 3 && (
        <ReviewStep
          agentName={agentName}
          clientEmail={clientEmail}
          businessName={businessName}
          businessDescription={businessDescription}
          agentType={agentType}
          selectedTools={selectedTools}
          apps={composioApps}
          connectionStatus={connectionStatus}
          createAction={createAction}
          createState={createState}
        />
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={back} disabled={step === 0}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canNext()}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Basic Info
// ---------------------------------------------------------------------------

function BasicInfoStep({
  agentName, setAgentName,
  clientEmail, setClientEmail,
  businessName, setBusinessName,
  businessDescription, setBusinessDescription,
  agentType, setAgentType,
}: {
  agentName: string; setAgentName: (v: string) => void;
  clientEmail: string; setClientEmail: (v: string) => void;
  businessName: string; setBusinessName: (v: string) => void;
  businessDescription: string; setBusinessDescription: (v: string) => void;
  agentType: string; setAgentType: (v: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5 max-w-xl">
      <div>
        <h2 className="text-foreground font-semibold text-[15px]">Agent Identity</h2>
        <p className="text-muted-foreground text-sm mt-1">Name your agent and tell us who it&apos;s for.</p>
      </div>
      <div className="space-y-4">
        <Field label="Agent Name">
          <Input placeholder="e.g. Atlas" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
        </Field>
        <Field label="Client Email">
          <Input type="email" placeholder="client@company.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
        </Field>
        <Field label="Business Name">
          <Input placeholder="e.g. Acme Corp" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </Field>
        <Field label="What does this business do?">
          <Input placeholder="One line — e.g. B2B SaaS for restaurant supply chains" value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} />
        </Field>
        <Field label="Agent Type">
          <select
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Tool Selection (Composio catalog)
// ---------------------------------------------------------------------------

function ToolSelectionStep({
  apps,
  totalCount,
  selected,
  onToggle,
  search,
  setSearch,
}: {
  apps: ComposioApp[];
  totalCount: number;
  selected: string[];
  onToggle: (key: string) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-[15px]">Select Tools</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Choose up to {MAX_TOOLS} from {totalCount > 0 ? `${totalCount}+` : "850+"} available tools.
          </p>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${
          selected.length === MAX_TOOLS ? "text-emerald-400" : "text-muted-foreground"
        }`}>
          {selected.length}/{MAX_TOOLS}
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search tools — Salesforce, Slack, Google Ads, Stripe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* App grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
        {apps.length > 0 ? (
          apps.slice(0, 60).map((app) => {
            const isSelected = selected.includes(app.key);
            const isDisabled = !isSelected && selected.length >= MAX_TOOLS;

            return (
              <button
                key={app.key}
                onClick={() => !isDisabled && onToggle(app.key)}
                disabled={isDisabled}
                className={`text-left bg-card border rounded-xl p-4 transition-all ${
                  isSelected
                    ? "border-emerald-500/40 ring-2 ring-emerald-500/20"
                    : isDisabled
                      ? "border-border opacity-40 cursor-not-allowed"
                      : "border-border hover:border-foreground/10 cursor-pointer"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden ${
                      isSelected ? "bg-emerald-500/10" : "bg-muted"
                    }`}>
                      <img
                        src={`https://logos.composio.dev/api/${app.key}`}
                        alt={app.name}
                        className="w-5 h-5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.textContent = app.name[0]?.toUpperCase() ?? "?"; }}
                      />
                    </div>
                    <div>
                      <p className="text-foreground font-medium text-sm">{app.name}</p>
                      {app.categories.length > 0 && (
                        <p className="text-muted-foreground/60 text-[10px] uppercase tracking-wider">
                          {app.categories[0]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {app.description && (
                  <p className="text-muted-foreground text-xs mt-2.5 line-clamp-2">{app.description}</p>
                )}
                {isSelected && (
                  <div className="mt-2.5 flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                    <CheckCircle2 className="size-3" />
                    Selected
                  </div>
                )}
              </button>
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center">
            <p className="text-muted-foreground text-sm">
              {search ? "No tools match your search" : "Loading tools from Composio..."}
            </p>
          </div>
        )}
      </div>

      {apps.length > 60 && !search && (
        <p className="text-muted-foreground/60 text-xs text-center">
          Showing 60 of {apps.length} tools. Use search to find specific tools.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Connect via OAuth
// ---------------------------------------------------------------------------

function ConnectStep({
  apps,
  selectedTools,
  connectionStatus,
  onConnect,
}: {
  apps: ComposioApp[];
  selectedTools: string[];
  connectionStatus: Record<string, { status: string; error?: string }>;
  onConnect: (appKey: string) => void;
}) {
  const selectedApps = selectedTools
    .map((key) => apps.find((a) => a.key === key))
    .filter(Boolean) as ComposioApp[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground font-semibold text-[15px]">Connect Tools</h2>
        <p className="text-muted-foreground text-sm mt-1">Authorize each tool via OAuth. Click Connect and sign in — Composio handles the rest.</p>
      </div>

      <div className="space-y-3">
        {selectedApps.map((app) => {
          const status = connectionStatus[app.key];

          return (
            <div key={app.key} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                    <img
                      src={`https://logos.composio.dev/api/${app.key}`}
                      alt={app.name}
                      className="w-5 h-5 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.textContent = app.name[0]?.toUpperCase() ?? "?"; }}
                    />
                  </div>
                  <div>
                    <p className="text-foreground font-medium text-sm">{app.name}</p>
                    <p className="text-muted-foreground/60 text-xs">{app.description?.slice(0, 60)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status?.status === "connected" && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 px-2.5 py-1 rounded-md">
                      <CheckCircle2 className="size-3" />
                      Connected
                    </span>
                  )}
                  {status?.status === "failed" && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold bg-red-500/10 text-red-400 ring-1 ring-red-500/20 px-2.5 py-1 rounded-md">
                      <XCircle className="size-3" />
                      Failed
                    </span>
                  )}
                  {status?.status !== "connected" && (
                    <Button
                      variant="outline"
                      onClick={() => onConnect(app.key)}
                      disabled={status?.status === "connecting"}
                    >
                      {status?.status === "connecting" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="size-3.5" />
                          Connect
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {status?.error && (
                <p className="text-red-400 text-xs mt-2">{status.error}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 rounded-lg">
        <Wrench className="size-4 text-muted-foreground shrink-0" />
        <p className="text-muted-foreground text-sm">
          You can skip connecting now and connect tools later from the agent settings page.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review & Activate
// ---------------------------------------------------------------------------

function ReviewStep({
  agentName,
  clientEmail,
  businessName,
  businessDescription,
  agentType,
  selectedTools,
  apps,
  connectionStatus,
  createAction,
  createState,
}: {
  agentName: string;
  clientEmail: string;
  businessName: string;
  businessDescription: string;
  agentType: string;
  selectedTools: string[];
  apps: ComposioApp[];
  connectionStatus: Record<string, { status: string; error?: string }>;
  createAction: (payload: FormData) => void;
  createState: CreateAgentState;
}) {
  const selectedApps = selectedTools
    .map((key) => apps.find((a) => a.key === key))
    .filter(Boolean) as ComposioApp[];

  const unconnectedCount = selectedTools.filter(
    (key) => connectionStatus[key]?.status !== "connected"
  ).length;

  const handleActivate = () => {
    const formData = new FormData();
    formData.set("agentName", agentName);
    formData.set("clientEmail", clientEmail);
    formData.set("businessName", businessName);
    formData.set("businessDescription", businessDescription);
    formData.set("agentType", agentType);
    formData.set("tools", JSON.stringify(selectedTools));
    formData.set("credentials", JSON.stringify([])); // OAuth handled by Composio

    startTransition(() => createAction(formData));
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-foreground font-semibold text-[15px]">Review & Activate</h2>
        <p className="text-muted-foreground text-sm mt-1">Confirm everything looks right, then activate your agent.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <ReviewRow label="Agent Name" value={agentName} />
        <ReviewRow label="Client Email" value={clientEmail} />
        <ReviewRow label="Business" value={`${businessName} — ${businessDescription}`} />
        <ReviewRow label="Agent Type" value={agentType} />
        <div>
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-2">Connected Tools</p>
          <div className="flex flex-wrap gap-2">
            {selectedApps.map((app) => {
              const isConnected = connectionStatus[app.key]?.status === "connected";
              return (
                <span
                  key={app.key}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  }`}
                >
                  {app.name} {isConnected ? "✓" : "(not connected)"}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {unconnectedCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <p className="text-amber-400 text-sm">
            {unconnectedCount} tool{unconnectedCount > 1 ? "s" : ""} not connected yet. You can connect them later from the agent page.
          </p>
        </div>
      )}

      {createState.error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-lg">
          <XCircle className="size-4 text-red-400" />
          <p className="text-red-400 text-sm">{createState.error}</p>
        </div>
      )}

      <Button onClick={handleActivate} size="lg" className="w-full">
        <Zap className="size-4" />
        Activate Agent
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider shrink-0">{label}</p>
      <p className="text-foreground text-sm text-right">{value}</p>
    </div>
  );
}
