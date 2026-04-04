"use client";

import { useState, useActionState, startTransition } from "react";
import {
  Wrench,
  Activity,
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

// Popular tools by agent type — shown first when Composio catalog loads (or as fallback)
const POPULAR_TOOLS: Record<string, ComposioApp[]> = {
  analytics: [
    { key: "google_analytics", name: "Google Analytics", description: "Web analytics — traffic, conversions, user behavior, funnels (GA4)", categories: ["analytics"] },
    { key: "posthog", name: "PostHog", description: "Product analytics — session replays, feature flags, A/B testing", categories: ["analytics"] },
    { key: "supabase", name: "Supabase", description: "Database — tables, queries, auth, storage, real-time subscriptions", categories: ["database"] },
    { key: "resend", name: "Resend", description: "Email delivery — agent sends reports, digests, and alerts via email", categories: ["email"] },
    { key: "mixpanel", name: "Mixpanel", description: "Product analytics — event tracking, funnels, flows, retention", categories: ["analytics"] },
    { key: "amplitude", name: "Amplitude", description: "Product analytics — charts, dashboards, cohorts, experiments", categories: ["analytics"] },
  ],
  sales: [
    { key: "salesforce", name: "Salesforce", description: "CRM — pipelines, contacts, opportunities, accounts, reports", categories: ["crm"] },
    { key: "hubspot", name: "HubSpot", description: "CRM — contacts, deals, companies, tickets, marketing email", categories: ["crm"] },
    { key: "pipedrive", name: "Pipedrive", description: "Sales CRM — deals, contacts, pipeline stages, activities", categories: ["crm"] },
    { key: "resend", name: "Resend", description: "Email delivery — outreach emails, follow-ups, templates", categories: ["email"] },
    { key: "linkedin", name: "LinkedIn", description: "Professional network — outreach, connections, lead gen", categories: ["crm"] },
    { key: "stripe", name: "Stripe", description: "Payments — customers, subscriptions, invoices, revenue", categories: ["payments"] },
  ],
  marketing: [
    { key: "google_ads", name: "Google Ads", description: "Advertising — campaigns, ad groups, keywords, conversions", categories: ["advertising"] },
    { key: "facebook", name: "Meta Ads", description: "Facebook + Instagram ads — campaigns, audiences, reporting", categories: ["advertising"] },
    { key: "mailchimp", name: "Mailchimp", description: "Email marketing — campaigns, audiences, templates, analytics", categories: ["email"] },
    { key: "resend", name: "Resend", description: "Email delivery — transactional email, broadcasts, templates, analytics", categories: ["email"] },
    { key: "semrush", name: "SEMrush", description: "SEO — traffic analytics, keyword research, competitor analysis", categories: ["seo"] },
    { key: "klaviyo", name: "Klaviyo", description: "Email marketing — campaigns, flows, segments, profiles", categories: ["email"] },
  ],
  support: [
    { key: "zendesk", name: "Zendesk", description: "Support — tickets, users, organizations, views, macros", categories: ["support"] },
    { key: "intercom", name: "Intercom", description: "Customer messaging — conversations, contacts, companies", categories: ["support"] },
    { key: "freshdesk", name: "Freshdesk", description: "Support — tickets, contacts, SLA policies, surveys", categories: ["support"] },
    { key: "slack", name: "Slack", description: "Messaging — channels, messages, threads, search", categories: ["communication"] },
    { key: "resend", name: "Resend", description: "Email delivery — ticket notifications, updates to clients", categories: ["email"] },
    { key: "notion", name: "Notion", description: "Workspace — pages, databases, blocks, search", categories: ["productivity"] },
  ],
  content: [
    { key: "notion", name: "Notion", description: "Workspace — pages, databases, blocks, search", categories: ["productivity"] },
    { key: "wordpress", name: "WordPress", description: "CMS — posts, pages, media, categories, tags", categories: ["cms"] },
    { key: "resend", name: "Resend", description: "Email delivery — newsletters, content distribution", categories: ["email"] },
    { key: "canva", name: "Canva", description: "Design — templates, graphics, social media assets", categories: ["design"] },
    { key: "semrush", name: "SEMrush", description: "SEO — keyword research, content audit, topic research", categories: ["seo"] },
    { key: "ahrefs", name: "Ahrefs", description: "SEO — content explorer, keyword ideas, backlink analysis", categories: ["seo"] },
  ],
  engagement: [
    { key: "slack", name: "Slack", description: "Messaging — channels, messages, threads, search", categories: ["communication"] },
    { key: "intercom", name: "Intercom", description: "Customer messaging — conversations, contacts, segments", categories: ["support"] },
    { key: "resend", name: "Resend", description: "Email delivery — engagement emails, onboarding sequences", categories: ["email"] },
    { key: "mixpanel", name: "Mixpanel", description: "Product analytics — funnels, retention, user flows", categories: ["analytics"] },
    { key: "posthog", name: "PostHog", description: "Product analytics — session replays, feature flags", categories: ["analytics"] },
    { key: "hubspot", name: "HubSpot", description: "CRM — contacts, lifecycle stages, workflows", categories: ["crm"] },
  ],
  ops: [
    { key: "github", name: "GitHub", description: "Code — repos, issues, PRs, actions, deployments", categories: ["developer tools"] },
    { key: "supabase", name: "Supabase", description: "Database — tables, queries, auth, storage, edge functions", categories: ["database"] },
    { key: "jira", name: "Jira", description: "Project management — issues, sprints, boards, epics", categories: ["project management"] },
    { key: "linear", name: "Linear", description: "Issue tracking — issues, projects, cycles, roadmaps", categories: ["project management"] },
    { key: "slack", name: "Slack", description: "Messaging — channels, messages, threads, alerts", categories: ["communication"] },
    { key: "resend", name: "Resend", description: "Email delivery — alerts, incident notifications, reports", categories: ["email"] },
  ],
  research: [
    { key: "google_search", name: "Google Search", description: "Web search — find information, articles, data", categories: ["search"] },
    { key: "notion", name: "Notion", description: "Workspace — research notes, databases, wikis", categories: ["productivity"] },
    { key: "ahrefs", name: "Ahrefs", description: "SEO — competitor research, content analysis, keywords", categories: ["seo"] },
    { key: "semrush", name: "SEMrush", description: "Market research — traffic analysis, competitor data", categories: ["seo"] },
    { key: "resend", name: "Resend", description: "Email delivery — research reports, findings digests", categories: ["email"] },
    { key: "linkedin", name: "LinkedIn", description: "Professional network — company research, people search", categories: ["crm"] },
  ],
  design: [
    { key: "figma", name: "Figma", description: "Design — files, components, styles, prototypes", categories: ["design"] },
    { key: "canva", name: "Canva", description: "Design — templates, graphics, brand kits", categories: ["design"] },
    { key: "notion", name: "Notion", description: "Workspace — design specs, feedback tracking", categories: ["productivity"] },
    { key: "slack", name: "Slack", description: "Messaging — design reviews, feedback channels", categories: ["communication"] },
    { key: "resend", name: "Resend", description: "Email delivery — design review notifications, approvals", categories: ["email"] },
    { key: "github", name: "GitHub", description: "Code — repos, issues, design system tracking", categories: ["developer tools"] },
  ],
  reputation: [
    { key: "google_my_business", name: "Google Business", description: "Business profile — reviews, posts, insights, Q&A", categories: ["marketing"] },
    { key: "resend", name: "Resend", description: "Email delivery — review requests, reputation alerts", categories: ["email"] },
    { key: "hubspot", name: "HubSpot", description: "CRM — customer feedback tracking, NPS", categories: ["crm"] },
    { key: "intercom", name: "Intercom", description: "Customer messaging — satisfaction, feedback collection", categories: ["support"] },
    { key: "semrush", name: "SEMrush", description: "SEO — brand monitoring, online visibility", categories: ["seo"] },
    { key: "slack", name: "Slack", description: "Messaging — reputation alerts, team notifications", categories: ["communication"] },
  ],
  custom: [
    { key: "slack", name: "Slack", description: "Messaging — channels, messages, threads, search", categories: ["communication"] },
    { key: "resend", name: "Resend", description: "Email delivery — transactional email, notifications", categories: ["email"] },
    { key: "notion", name: "Notion", description: "Workspace — pages, databases, blocks, search", categories: ["productivity"] },
    { key: "supabase", name: "Supabase", description: "Database — tables, queries, auth, storage", categories: ["database"] },
    { key: "github", name: "GitHub", description: "Code — repos, issues, PRs, actions", categories: ["developer tools"] },
    { key: "posthog", name: "PostHog", description: "Product analytics — events, funnels, session replays", categories: ["analytics"] },
  ],
};

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
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [agentType, setAgentType] = useState("analytics");

  // Step 2 state
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Step 3 state
  const [connectionStatus, setConnectionStatus] = useState<
    Record<string, { status: "pending" | "connecting" | "connected" | "failed" | "testing"; error?: string }>
  >({});

  // Step 4 state
  const [createState, createAction] = useActionState<CreateAgentState, FormData>(createAgentAction, {
    success: null,
    agentId: null,
    error: null,
  });

  // Build tool list: popular tools for agent type first, then Composio catalog
  const popularForType = POPULAR_TOOLS[agentType] ?? [];
  const popularKeys = new Set(popularForType.map((t) => t.key));

  // Merge: popular first, then Composio apps that aren't already in popular
  const mergedApps = [
    ...popularForType,
    ...composioApps.filter((app) => !popularKeys.has(app.key)),
  ];

  // Filter by search
  const filteredApps = mergedApps.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.key.toLowerCase().includes(q) ||
      (app.description?.toLowerCase().includes(q) ?? false) ||
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

  // Verify connection status with Composio
  const verifyConnection = async (appKey: string): Promise<boolean> => {
    try {
      const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "";
      const res = await fetch(`${oracleUrl}/composio/connections/${encodeURIComponent(clientEmail)}`);
      if (!res.ok) return false;
      const connections = await res.json();
      return Array.isArray(connections) && connections.some(
        (c: any) => c.appName?.toLowerCase() === appKey.toLowerCase() && c.status === "ACTIVE"
      );
    } catch {
      return false;
    }
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
          clientId: clientEmail,
          appName: appKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Connection failed" }));
        throw new Error(errData.error ?? "Connection failed");
      }
      const data = await res.json();

      if (data.redirectUrl) {
        const popup = window.open(data.redirectUrl, "composio_connect", "width=600,height=700");

        // Poll for popup close, then verify actual connection
        const timer = setInterval(async () => {
          if (!popup || popup.closed) {
            clearInterval(timer);

            // Wait a moment for Composio to process, then verify
            setConnectionStatus((prev) => ({ ...prev, [appKey]: { status: "connecting" } }));

            // Try up to 3 times with 2s delay
            let verified = false;
            for (let i = 0; i < 3; i++) {
              await new Promise((r) => setTimeout(r, 2000));
              verified = await verifyConnection(appKey);
              if (verified) break;
            }

            setConnectionStatus((prev) => ({
              ...prev,
              [appKey]: verified
                ? { status: "connected" }
                : { status: "failed", error: "Connection not completed. Click Connect to try again." },
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

  // Test a specific tool connection
  const testTool = async (appKey: string) => {
    setConnectionStatus((prev) => ({ ...prev, [appKey]: { ...prev[appKey], status: "testing" } }));
    const verified = await verifyConnection(appKey);
    setConnectionStatus((prev) => ({
      ...prev,
      [appKey]: verified
        ? { status: "connected" }
        : { status: "failed", error: "Connection not active. Click Connect to authorize." },
    }));
  };

  // Connect via API key (no popup)
  const connectToolApiKey = async (appKey: string, toolApiKey: string) => {
    setConnectionStatus((prev) => ({ ...prev, [appKey]: { status: "connecting" } }));
    try {
      const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_URL ?? "";
      const res = await fetch(`${oracleUrl}/composio/connect-apikey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientEmail, appName: appKey, apiKey: toolApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");

      setConnectionStatus((prev) => ({ ...prev, [appKey]: { status: "connected" } }));
    } catch (error) {
      setConnectionStatus((prev) => ({
        ...prev,
        [appKey]: { status: "failed", error: error instanceof Error ? error.message : "Connection failed" },
      }));
    }
  };

  // Disconnect a tool
  const disconnectTool = (appKey: string) => {
    setConnectionStatus((prev) => ({
      ...prev,
      [appKey]: { status: "pending" },
    }));
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
          businessWebsite={businessWebsite} setBusinessWebsite={setBusinessWebsite}
          businessDescription={businessDescription} setBusinessDescription={setBusinessDescription}
          agentType={agentType} setAgentType={setAgentType}
        />
      )}
      {step === 1 && (
        <ToolSelectionStep
          apps={filteredApps}
          totalCount={mergedApps.length}
          popularCount={popularForType.length}
          selected={selectedTools}
          onToggle={toggleTool}
          search={search}
          setSearch={setSearch}
        />
      )}
      {step === 2 && (
        <ConnectStep
          apps={mergedApps}
          selectedTools={selectedTools}
          connectionStatus={connectionStatus}
          onConnect={connectTool}
          onConnectApiKey={connectToolApiKey}
          onTest={testTool}
          onDisconnect={disconnectTool}
        />
      )}
      {step === 3 && (
        <ReviewStep
          agentName={agentName}
          clientEmail={clientEmail}
          businessName={businessName}
          businessWebsite={businessWebsite}
          businessDescription={businessDescription}
          agentType={agentType}
          selectedTools={selectedTools}
          apps={mergedApps}
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
  businessWebsite, setBusinessWebsite,
  businessDescription, setBusinessDescription,
  agentType, setAgentType,
}: {
  agentName: string; setAgentName: (v: string) => void;
  clientEmail: string; setClientEmail: (v: string) => void;
  businessName: string; setBusinessName: (v: string) => void;
  businessWebsite: string; setBusinessWebsite: (v: string) => void;
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
        <Field label="Website URL">
          <Input type="url" placeholder="e.g. mcquizzy.com" value={businessWebsite} onChange={(e) => setBusinessWebsite(e.target.value)} />
          <p className="text-muted-foreground/50 text-[11px] mt-1">Agent will automatically scan this site on activation to learn the business</p>
        </Field>
        <Field label="What does this business do?">
          <Input placeholder="One line — e.g. B2B SaaS for restaurant supply chains" value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} />
        </Field>
        <Field label="Agent Type">
          <AgentTypeSelect value={agentType} onChange={setAgentType} />
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
  popularCount,
  selected,
  onToggle,
  search,
  setSearch,
}: {
  apps: ComposioApp[];
  totalCount: number;
  popularCount: number;
  selected: string[];
  onToggle: (key: string) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const recommendedApps = search ? apps : apps.slice(0, popularCount);
  const allApps = search ? [] : apps.slice(popularCount);
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

      {/* Selected tools bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider shrink-0">Selected:</span>
          {selected.map((key) => {
            const app = apps.find((a) => a.key === key);
            return (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 px-2 py-0.5 rounded-md text-xs font-medium hover:bg-red-500/10 hover:text-red-400 hover:ring-red-500/20 transition-colors"
              >
                <img src={`https://logos.composio.dev/api/${key}`} alt="" className="w-3.5 h-3.5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {app?.name ?? key}
                <XCircle className="size-3 opacity-60" />
              </button>
            );
          })}
        </div>
      )}

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
      <div className="max-h-[600px] overflow-y-auto pr-1 space-y-4">
        {/* Recommended section */}
        {recommendedApps.length > 0 && (
          <div>
            {!search && <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-3">Recommended for this agent type</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendedApps.map((app) => (
                <ToolCard key={app.key} app={app} isSelected={selected.includes(app.key)} isDisabled={!selected.includes(app.key) && selected.length >= MAX_TOOLS} onToggle={onToggle} />
              ))}
            </div>
          </div>
        )}

        {/* All Tools section */}
        {allApps.length > 0 && (
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-3 pt-2 border-t border-border">All Tools ({allApps.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allApps.slice(0, 54).map((app) => (
                <ToolCard key={app.key} app={app} isSelected={selected.includes(app.key)} isDisabled={!selected.includes(app.key) && selected.length >= MAX_TOOLS} onToggle={onToggle} />
              ))}
            </div>
          </div>
        )}

        {apps.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground text-sm">No tools match your search</p>
          </div>
        )}
      </div>

      {allApps.length > 54 && !search && (
        <p className="text-muted-foreground/60 text-xs text-center">
          Showing 60 of {totalCount} tools. Use search to find specific tools.
        </p>
      )}
    </div>
  );
}

function ToolCard({ app, isSelected, isDisabled, onToggle }: {
  app: ComposioApp;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
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
}

// ---------------------------------------------------------------------------
// Step 3: Connect via OAuth
// ---------------------------------------------------------------------------

function ConnectStep({
  apps,
  selectedTools,
  connectionStatus,
  onConnect,
  onConnectApiKey,
  onTest,
  onDisconnect,
}: {
  apps: ComposioApp[];
  selectedTools: string[];
  connectionStatus: Record<string, { status: string; error?: string }>;
  onConnect: (appKey: string) => void;
  onConnectApiKey: (appKey: string, apiKey: string) => void;
  onTest: (appKey: string) => void;
  onDisconnect: (appKey: string) => void;
}) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  // Tools that use API key auth (not OAuth popup)
  // Tools that use API key auth — only list tools whose Composio auth config is API_KEY
  // OAuth tools (supabase, slack, gmail, google sheets, etc.) use the popup flow
  const API_KEY_TOOLS = new Set(["resend", "posthog", "sendgrid", "mailchimp", "stripe", "hubspot", "klaviyo", "ahrefs", "semrush", "amplitude", "mixpanel", "pipedrive", "freshdesk", "monday", "linear", "notion", "asana", "datadog", "shopify", "zendesk", "intercom"]);
  const selectedApps = selectedTools
    .map((key) => apps.find((a) => a.key === key))
    .filter(Boolean) as ComposioApp[];

  const hasAnyConnected = selectedTools.some((key) => connectionStatus[key]?.status === "connected");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-[15px]">Connect Tools</h2>
          <p className="text-muted-foreground text-sm mt-1">Authorize each tool via OAuth. Click Connect and sign in — Composio handles the rest.</p>
        </div>
        {hasAnyConnected && (
          <Button variant="outline" onClick={() => selectedTools.forEach((key) => onTest(key))}>
            <Activity className="size-3.5" />
            Test All
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {selectedApps.map((app) => {
          const status = connectionStatus[app.key];
          const isConnected = status?.status === "connected";
          const isFailed = status?.status === "failed";
          const isConnecting = status?.status === "connecting";
          const isTesting = status?.status === "testing";
          const isApiKey = API_KEY_TOOLS.has(app.key);

          return (
            <div key={app.key} className={`bg-card border rounded-xl p-5 ${isConnected ? "border-emerald-500/20" : "border-border"}`}>
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
                  {isConnected && (
                    <>
                      <span className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="size-3" />
                        Connected
                      </span>
                      <Button variant="outline" size="sm" onClick={() => onTest(app.key)}>
                        Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDisconnect(app.key)} className="text-muted-foreground hover:text-red-400">
                        <XCircle className="size-3.5" />
                      </Button>
                    </>
                  )}
                  {isFailed && !isApiKey && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold bg-red-500/10 text-red-400 ring-1 ring-red-500/20 px-2.5 py-1 rounded-md">
                      <XCircle className="size-3" />
                      Failed
                    </span>
                  )}
                  {!isConnected && !isApiKey && (
                    <Button
                      variant="outline"
                      onClick={() => onConnect(app.key)}
                      disabled={isConnecting || isTesting}
                    >
                      {isConnecting || isTesting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="size-3.5" />
                          {isFailed ? "Reconnect" : "Connect"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* API Key input for non-OAuth tools */}
              {isApiKey && !isConnected && (
                <div className="flex gap-2 mt-3">
                  <Input
                    type="password"
                    placeholder={`Paste your ${app.name} API key`}
                    value={apiKeys[app.key] ?? ""}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [app.key]: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => onConnectApiKey(app.key, apiKeys[app.key] ?? "")}
                    disabled={!apiKeys[app.key] || isConnecting}
                  >
                    {isConnecting ? <Loader2 className="size-4 animate-spin" /> : "Connect"}
                  </Button>
                </div>
              )}

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
  businessWebsite,
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
  businessWebsite: string;
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
    formData.set("businessWebsite", businessWebsite);
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
        {businessWebsite && <ReviewRow label="Website" value={businessWebsite} />}
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

function AgentTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-left flex items-center justify-between outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="text-foreground">{value.charAt(0).toUpperCase() + value.slice(1)}</span>
        <ChevronRight className={`size-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="fixed z-50 bg-card border border-border rounded-lg shadow-2xl shadow-black/30 py-1 max-h-[280px] overflow-y-auto w-[300px]"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Select Agent Type</p>
            {AGENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { onChange(t); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  t === value
                    ? "bg-foreground/10 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
