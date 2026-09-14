"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseTable } from "@/lib/parse-table";
import { AgentAvatar } from "@/components/brand-mark";
import { NavigationLink as Link } from "@/components/navigation-link";
import { HighLevelCard } from "@/app/agents/[id]/tools/highlevel-card";

type Tool = {
  id: string;
  name: string;
  kind: string;
  url: string | null;
  appSlug: string | null;
  logoUrl: string | null;
  filename: string | null;
};
type Session = {
  id: string;
  toolId: string;
  toolName: string;
  status: string;
  url: string;
  viewUrl: string | null;
  consentOrigin: string | null;
  watching: boolean;
  watchedMs: number;
  ownerTabId: string;
  heartbeatSeq: number;
};
type Rule = {
  id: string;
  group: string;
  text: string;
  status: string;
  sourceKind: string;
  proposedReason: string | null;
  createdAt: string;
};
type Turn = {
  automatic?: boolean;
  id: string;
  message: string;
  response: string | null;
  kind: string;
  status: string;
  createdAt: string;
};
export type WorkspaceState = {
  tools: Tool[];
  session: Session | null;
  rules: Rule[];
  turns: Turn[];
};
type App = {
  key: string;
  name: string;
  description: string;
  logo: string | null;
};
type FileView = { id: string; name: string; content: string };
export type WorkspaceMode = "home" | "chat" | "playbook" | "files";
const groups: Record<string, string> = {
  target: "What to go after",
  outreach: "How to work",
  never: "What never to do",
  stop: "When to hand over",
};
const duration = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export async function workspaceApi(
  path: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(`/api/workspace/${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Your session expired. Please sign in again." }));
  if (!response.ok)
    throw new Error(
      data.error ?? "The workspace could not complete this request.",
    );
  return data;
}
function Glyph({
  name,
}: {
  name: "browser" | "chat" | "plus" | "expand" | "file" | "close";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {name === "browser" && (
        <>
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="3"
            fill="currentColor"
            fillOpacity=".1"
          />
          <path d="M3 9h18M7 6.5h.1M10 6.5h.1" />
        </>
      )}
      {name === "chat" && (
        <>
          <path
            d="M5 4h14a2 2 0 0 1 2 2v11H9l-6 4V6a2 2 0 0 1 2-2Z"
            fill="currentColor"
            fillOpacity=".1"
          />
          <path d="M7 9h10M7 13h6" />
        </>
      )}
      {name === "file" && (
        <>
          <path d="M6 3h8l4 4v14H6Z" fill="currentColor" fillOpacity=".1" />
          <path d="M14 3v5h4M9 12h6M9 16h6" />
        </>
      )}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "expand" && <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}
function ToolMark({
  tool,
}: {
  tool: { name: string; logoUrl?: string | null };
}) {
  return (
    <span className="ws-tool-mark">
      {tool.logoUrl ? (
        <img src={tool.logoUrl} alt="" width="23" height="23" />
      ) : (
        <Glyph name="browser" />
      )}
    </span>
  );
}

export function Workspace({
  agentId,
  agentName,
  agentStatus,
  mode = "home",
  initial,
}: {
  agentId: string;
  agentName: string;
  agentStatus: string;
  mode?: WorkspaceMode;
  initial?: WorkspaceState;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<WorkspaceState>(
    initial ?? { tools: [], session: null, rules: [], turns: [] },
  );
  const [loaded, setLoaded] = useState(!!initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [add, setAdd] = useState(search.get("add") === "1");
  const [addType, setAddType] = useState<"web" | "app" | "file">("web");
  // GoHighLevel connects with a Private Integration Token through direct MCP,
  // not Composio OAuth, so it gets its own entry inside the Connected app tab.
  const [ghl, setGhl] = useState(false);
  const [apps, setApps] = useState<App[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [message, setMessage] = useState("");
  const [chatKind, setChatKind] = useState<"learn" | "work">("learn");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<FileView | null>(null);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [mobileText, setMobileText] = useState("");
  const tabId = useRef("");
  const current = useRef(state);
  const elapsedStart = useRef(performance.now());
  const seq = useRef(initial?.session?.heartbeatSeq ?? 0);
  const heartbeatBusy = useRef(false);
  const watchingWanted = useRef(false);
  const visibleUntil = useRef<number | null>(null);
  const hiddenQueued = useRef(false);
  const autoAt = useRef(0);
  const requestIntent = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const bottom = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const consentDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  current.current = state;

  const refresh = useCallback(async () => {
    const data = (await workspaceApi("state")) as WorkspaceState;
    setState(data);
    setLoaded(true);
    if (data.session)
      seq.current = Math.max(seq.current, data.session.heartbeatSeq);
  }, []);
  useEffect(() => {
    tabId.current =
      sessionStorage.getItem("ambitt-workspace-tab") || crypto.randomUUID();
    sessionStorage.setItem("ambitt-workspace-tab", tabId.current);
    if (!initial)
      void refresh().catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, [refresh]);
  useEffect(() => {
    if (search.get("add") === "1") {
      setAdd(true);
      router.replace("/", { scroll: false });
    }
  }, [search, router]);
  useEffect(() => {
    if (add) dialog.current?.showModal();
    else dialog.current?.close();
  }, [add]);
  useEffect(() => {
    if (!add || addType !== "app") setGhl(false);
  }, [add, addType]);
  useEffect(() => {
    if (consent) consentDialog.current?.showModal();
    else consentDialog.current?.close();
  }, [consent]);
  useEffect(() => {
    if (edit) editDialog.current?.showModal();
    else editDialog.current?.close();
  }, [edit]);
  useEffect(() => {
    document.documentElement.classList.toggle("workspace-focus", focus);
    return () => document.documentElement.classList.remove("workspace-focus");
  }, [focus]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    setAddress(state.session?.url ?? "");
  }, [state.session?.url]);
  useEffect(() => {
    const container = bottom.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [state.turns]);
  const pending = state.turns.some((t) => t.status === "pending");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void refresh().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  const perform = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  };
  const updateSession = (session: Session) =>
    setState((s) => ({
      ...s,
      session: {
        ...session,
        watching: session.watching && watchingWanted.current,
      },
    }));
  const heartbeat = useCallback(
    async (visible = document.visibilityState === "visible") => {
      const s = current.current.session;
      if (!s || s.status !== "running" || s.ownerTabId !== tabId.current)
        return;
      if (!visible) {
        watchingWanted.current = false;
        visibleUntil.current ??= performance.now();
      }
      if (heartbeatBusy.current) {
        if (!visible) hiddenQueued.current = true;
        return;
      }
      heartbeatBusy.current = true;
      const now = performance.now(),
        elapsedMs = Math.max(
          0,
          Math.min(
            30_000,
            (visibleUntil.current ?? now) - elapsedStart.current,
          ),
        );
      elapsedStart.current = now;
      try {
        const requestSeq = ++seq.current;
        const session = await workspaceApi(`sessions/${s.id}/heartbeat`, {
          tabId: tabId.current,
          seq: requestSeq,
          visible: visible && watchingWanted.current,
          elapsedMs,
        });
        if (requestSeq === seq.current) updateSession(session);
      } catch {
        setState((v) => ({
          ...v,
          session: v.session ? { ...v.session, watching: false } : null,
        }));
      } finally {
        heartbeatBusy.current = false;
        if (hiddenQueued.current) {
          hiddenQueued.current = false;
          void heartbeat(false);
        }
      }
    },
    [],
  );
  useEffect(() => {
    if (!state.session || state.session.status !== "running") return;
    elapsedStart.current = performance.now();
    const timer = setInterval(() => void heartbeat(), 3000);
    const visibility = () => {
      if (document.visibilityState !== "visible") {
        watchingWanted.current = false;
        visibleUntil.current = performance.now();
        setState((v) => ({
          ...v,
          session: v.session ? { ...v.session, watching: false } : null,
        }));
      }
      void heartbeat();
    };
    const leave = () => {
      const s = current.current.session;
      if (!s || s.ownerTabId !== tabId.current) return;
      // keepalive request can finish during navigation; the server lease is
      // the fallback when a browser is killed without an unload event.
      void fetch(`/api/workspace/sessions/${s.id}/heartbeat`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tabId: tabId.current,
          seq: ++seq.current,
          visible: false,
          elapsedMs: Math.max(
            0,
            Math.min(
              6000,
              (visibleUntil.current ?? performance.now()) -
                elapsedStart.current,
            ),
          ),
        }),
      });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      leave();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
    };
  }, [state.session?.id, state.session?.status, heartbeat]);

  async function send(value: string, automatic = false) {
    const s = current.current;
    if (!value.trim() || s.turns.some((t) => t.status === "pending")) return;
    const fingerprint = JSON.stringify([
      value,
      automatic ? "learn" : chatKind,
      s.session?.id,
      file?.id,
    ]);
    if (requestIntent.current?.fingerprint !== fingerprint)
      requestIntent.current = { fingerprint, id: crypto.randomUUID() };
    await workspaceApi("turns", {
      requestId: requestIntent.current.id,
      automatic,
      message: value,
      kind: automatic ? "learn" : chatKind,
      sessionId: s.session?.id,
      fileId: file?.id,
    });
    requestIntent.current = null;
    if (!automatic) setMessage("");
    await refresh();
  }
  useEffect(() => {
    if (
      !state.session?.watching ||
      pending ||
      chatKind !== "learn" ||
      document.visibilityState !== "visible"
    )
      return;
    if (state.session.watchedMs - autoAt.current < 60_000) return;
    autoAt.current = state.session.watchedMs;
    void send(
      "Review the steps I just demonstrated. Tell me what you observed and ask one useful question about why I work this way.",
      true,
    ).catch(() => {});
  }, [state.session?.watchedMs, state.session?.watching, pending]);
  useEffect(() => {
    if (!add || addType !== "app") return;
    setCatalogLoading(true);
    workspaceApi("catalog")
      .then((data) => {
        setApps(data.apps);
        setConnected(
          data.connections
            .filter((c: { status: string }) => c.status === "ACTIVE")
            .map((c: { appName: string }) => c.appName),
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setCatalogLoading(false));
  }, [add, addType]);

  async function openTool(tool: Tool) {
    if (tool.kind === "file") {
      setFile(await workspaceApi(`files/${tool.id}`));
      return;
    }
    if (tool.kind === "app") {
      router.push("/agent/tools");
      return;
    }
    setFile(null);
    const s = current.current.session;
    if (s?.id && s.toolId !== tool.id) {
      await heartbeat(false);
      await workspaceApi(`sessions/${s.id}/close`, {});
    }
    const next = await workspaceApi("sessions", {
      toolId: tool.id,
      tabId: tabId.current,
    });
    autoAt.current = next.watchedMs;
    updateSession(next);
    seq.current = next.heartbeatSeq;
  }
  useEffect(() => {
    const requested = search.get("tool");
    if (loaded && requested) {
      const tool = state.tools.find((t) => t.id === requested);
      if (tool && state.session?.toolId !== requested)
        void perform("open", () => openTool(tool));
    }
  }, [loaded, search]);
  async function control(action: string, extra: Record<string, string> = {}) {
    if (!state.session) return;
    updateSession(
      await workspaceApi(`sessions/${state.session.id}/control`, {
        action,
        tabId: tabId.current,
        ...extra,
      }),
    );
  }
  async function setWatching(on: boolean) {
    if (!state.session) return;
    if (!on) await heartbeat(false);
    const next = await workspaceApi(`sessions/${state.session.id}/watch`, {
      tabId: tabId.current,
      on,
      consent: on,
      origin: new URL(state.session.url).origin,
    });
    seq.current = Math.max(seq.current, next.heartbeatSeq);
    hiddenQueued.current = false;
    watchingWanted.current = on;
    visibleUntil.current = on ? null : performance.now();
    updateSession(next);
    elapsedStart.current = performance.now();
    setConsent(false);
  }
  async function addWebsite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await perform("add", async () => {
      await workspaceApi("tools", {
        name: form.get("name"),
        url: form.get("url"),
      });
      await refresh();
      setAdd(false);
      router.refresh();
    });
  }
  async function uploadFile(upload: File) {
    if (upload.size > 5_000_000)
      throw new Error("Files must be smaller than 5 MB.");
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(upload);
    });
    const result = await workspaceApi("files", {
      filename: upload.name,
      content,
    });
    await refresh();
    setAdd(false);
    setFile(await workspaceApi(`files/${result.id}`));
    router.refresh();
  }
  async function downloadFile(id: string) {
    const data = await workspaceApi(`files/${id}/download`);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function decide(rule: Rule, action: string, revised?: string) {
    await workspaceApi(`rules/${rule.id}`, {
      action,
      ...(revised ? { text: revised } : {}),
    });
    await refresh();
    setEdit(null);
  }
  const proposals = state.rules.filter((r) => r.status === "proposed");
  const session = state.session;
  const canControl = !session || session.ownerTabId === tabId.current;
  const browserActive = session?.status === "running" && session.viewUrl;
  const preferredApps = [
    "gmail",
    "googlesheets",
    "googledrive",
    "hubspot",
    "quickbooks",
    "slack",
    "notion",
    "outlook",
  ];
  // The Composio catalogue may carry its own HighLevel toolkit. The runtime
  // routes GoHighLevel through direct MCP only, so that entry is hidden and
  // the token entry below is shown for an empty or matching search instead.
  const isHighLevel = (text: string) => /high\s*level/i.test(text);
  const showHighLevel = "gohighlevel go high level ghl crm".includes(
    query.trim().toLowerCase(),
  );
  const foundApps = apps
    .filter((a) => !isHighLevel(`${a.key} ${a.name}`))
    .filter((a) =>
      `${a.name} ${a.description}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (preferredApps.includes(b.key) ? 1 : 0) -
        (preferredApps.includes(a.key) ? 1 : 0),
    )
    .slice(0, query ? 60 : 24);
  const ruleCard = (rule: Rule) => (
    <article
      className={`ws-rule ${rule.status === "proposed" ? "ws-proposal" : ""}`}
      key={rule.id}
    >
      <div className="ws-eyebrow">
        {rule.status === "proposed" ? "For your review" : groups[rule.group]}{" "}
        <span>· {new Date(rule.createdAt).toLocaleDateString()}</span>
      </div>
      <p>{rule.text}</p>
      {rule.proposedReason && rule.status === "proposed" && (
        <small>{rule.proposedReason}</small>
      )}
      {rule.status === "proposed" && (
        <small>
          Applies to future decisions and work still awaiting action. It cannot
          change anything already sent.
        </small>
      )}
      <div className="ws-actions">
        {rule.status === "proposed" ? (
          <>
            <button
              className="ws-primary"
              disabled={!!busy}
              onClick={() =>
                void perform("rule", () => decide(rule, "approve"))
              }
            >
              Confirm instruction
            </button>
            <button
              disabled={!!busy}
              onClick={() =>
                void perform("rule", () => decide(rule, "decline"))
              }
            >
              Dismiss
            </button>
          </>
        ) : (
          <button
            disabled={!!busy}
            onClick={() => void perform("rule", () => decide(rule, "retire"))}
          >
            Retire
          </button>
        )}
        <button disabled={!!busy} onClick={() => setEdit(rule)}>
          Edit
        </button>
      </div>
    </article>
  );
  const chatPanel = (
    <aside className="ws-agent-panel" aria-label={`Chat with ${agentName}`}>
      <div className="ws-agent-heading">
        <AgentAvatar size={34} />
        <div>
          <strong>{agentName}</strong>
          <span>
            {session?.watching
              ? "Watching this website"
              : "Here when you need me"}
          </span>
        </div>
        <span className={`ws-dot ${session?.watching ? "on" : ""}`} />
      </div>
      <div className="ws-chat-mode" role="group" aria-label="Conversation mode">
        <button
          aria-pressed={chatKind === "learn"}
          onClick={() => setChatKind("learn")}
        >
          Learn together
        </button>
        <button
          aria-pressed={chatKind === "work"}
          onClick={() => setChatKind("work")}
        >
          Do a task
        </button>
      </div>
      <p className="ws-mode-hint">
        {chatKind === "learn"
          ? "Explain the why behind your work. Instructions wait for your confirmation."
          : `Tasks use your connected tools and ${agentName}’s existing approval settings.`}
      </p>
      <div className="ws-conversation" aria-live="polite">
        {state.turns.length === 0 && (
          <div className="ws-greeting">
            <span className="ws-eyebrow">A little context goes a long way</span>
            <h3>Show me how you work.</h3>
            <p>
              Open a tool, switch watching on, and walk me through a task. Or
              tell me what you want to get done.
            </p>
            <button
              onClick={() =>
                setMessage("Let’s start with the outcome I want each week.")
              }
            >
              Help me get started <span>↗</span>
            </button>
          </div>
        )}
        {state.turns.map((t) => (
          <div className="ws-turn" key={t.id}>
            {!t.automatic && (
              <div className="ws-user-message">
                {t.message.split("\n\nUser-selected file data")[0]}
              </div>
            )}
            <div
              className={`ws-agent-message ${t.status === "failed" || t.status === "interrupted" ? "ws-failed" : ""}`}
            >
              <span className="ws-eyebrow">
                {agentName} · {t.kind === "learn" ? "Learning" : "Task"}
              </span>
              <p>
                {t.response ?? (
                  <span className="ws-thinking">
                    {t.kind === "learn"
                      ? "Thinking through your workflow…"
                      : "Working on your request…"}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
        {mode !== "playbook" && proposals.length > 0 && (
          <div className="ws-learning">
            <span className="ws-eyebrow">
              Proposed instructions · {proposals.length}
            </span>
            {proposals.slice(0, 3).map(ruleCard)}
            {proposals.length > 3 && (
              <Link href="/playbook">Review all instructions →</Link>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="ws-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void perform("send", () => send(message));
        }}
      >
        {file && <span className="ws-file-context">Using {file.name}</span>}
        <textarea
          aria-label={`Message ${agentName}`}
          placeholder={
            chatKind === "learn"
              ? "Explain a step, ask a question…"
              : `Ask ${agentName} to do something…`
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={6000}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (message.trim() && !pending && !busy)
                void perform("send", () => send(message));
            }
          }}
        />
        <div>
          <span>
            {pending
              ? "Reply in progress"
              : "Enter to send · Shift + Enter for a new line"}
          </span>
          <button
            className="ws-primary"
            type="submit"
            disabled={
              !message.trim() ||
              pending ||
              !!busy ||
              (chatKind === "work" && agentStatus !== "active")
            }
          >
            Send ↑
          </button>
        </div>
        {chatKind === "work" && agentStatus !== "active" && (
          <small>
            Your agent is {agentStatus.replace("_", " ")}. Learning is available
            while tasks are on hold.
          </small>
        )}
      </form>
    </aside>
  );

  return (
    <div className={`ws-root ws-${mode} ${focus ? "ws-focused" : ""}`}>
      <div className="ws-heading">
        <div>
          <span className="ws-eyebrow">YOUR WORKSPACE</span>
          <h1>
            {mode === "home"
              ? "A place to work. An agent to help."
              : mode === "chat"
                ? `Talk to ${agentName}`
                : mode === "playbook"
                  ? "Your Playbook"
                  : "Files & knowledge"}
          </h1>
        </div>
        <div className="ws-heading-actions">
          <Link href="/overview">Work overview ↗</Link>
          <button className="ws-primary" onClick={() => setAdd(true)}>
            <Glyph name="plus" /> Integrations
          </button>
        </div>
      </div>
      {error && (
        <div className="ws-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
          <button onClick={() => void perform("refresh", refresh)}>
            Retry
          </button>
        </div>
      )}
      {!loaded && (
        <p className="ws-muted" role="status">
          Opening your workspace…
        </p>
      )}
      <div className="ws-layout">
        {mode !== "chat" && (
          <section className="ws-main-panel">
            {mode === "home" && (
              <>
                <div className="ws-tabs" aria-label="Your tools">
                  {state.tools
                    .filter((t) => t.kind === "web" || t.kind === "file")
                    .map((t) => (
                      <button
                        key={t.id}
                        className={
                          session?.toolId === t.id || file?.id === t.id
                            ? "selected"
                            : ""
                        }
                        disabled={!!busy}
                        onClick={() => void perform("open", () => openTool(t))}
                      >
                        <ToolMark tool={t} />
                        <span>{t.name}</span>
                      </button>
                    ))}
                  <button aria-label="Integrations" onClick={() => setAdd(true)}>
                    <Glyph name="plus" />
                  </button>
                </div>
                <div className="ws-browser-bar">
                  <div className="ws-browser-nav">
                    <button
                      aria-label="Back"
                      disabled={!browserActive || !!busy || !canControl}
                      onClick={() =>
                        void perform("navigate", () => control("back"))
                      }
                    >
                      ←
                    </button>
                    <button
                      aria-label="Forward"
                      disabled={!browserActive || !!busy || !canControl}
                      onClick={() =>
                        void perform("navigate", () => control("forward"))
                      }
                    >
                      →
                    </button>
                    <button
                      aria-label="Reload website"
                      disabled={!browserActive || !!busy || !canControl}
                      onClick={() =>
                        void perform("navigate", () => control("reload"))
                      }
                    >
                      ↻
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void perform("navigate", () =>
                        control("navigate", { url: address }),
                      );
                    }}
                  >
                    <Glyph name="browser" />
                    <input
                      aria-label="Website address"
                      value={address}
                      placeholder="Open a tool to start browsing"
                      onChange={(e) => setAddress(e.target.value)}
                      disabled={!browserActive || !canControl}
                    />
                  </form>
                  <button
                    className="ws-focus-button"
                    aria-label={focus ? "Exit focus mode" : "Enter focus mode"}
                    title={focus ? "Exit focus mode" : "Focus mode"}
                    onClick={() => setFocus(!focus)}
                  >
                    <Glyph name="expand" />
                  </button>
                </div>
                <div
                  className={`ws-watch-bar ${session?.watching ? "watching" : ""}`}
                >
                  <span className={`ws-dot ${session?.watching ? "on" : ""}`} />
                  <span>
                    {session?.watching
                      ? `${agentName} is watching · ${session.consentOrigin}`
                      : "Watching is off. Your browser is yours."}
                  </span>
                  <span className="ws-watch-time">
                    {duration(session?.watchedMs ?? 0)}
                  </span>
                  <button
                    disabled={!browserActive || !canControl || !!busy}
                    onClick={() =>
                      session?.watching
                        ? void perform("watch", () => setWatching(false))
                        : setConsent(true)
                    }
                  >
                    {session?.watching ? "Stop watching" : "Start watching"}
                  </button>
                </div>
                {file ? (
                  <div className="ws-file-view">
                    <div className="ws-file-title">
                      <Glyph name="file" />
                      <strong>{file.name}</strong>
                      <button
                        onClick={() =>
                          void perform("download", () => downloadFile(file.id))
                        }
                      >
                        Download
                      </button>
                      <button onClick={() => setFile(null)}>Close file</button>
                    </div>
                    <FileContent file={file} />
                  </div>
                ) : browserActive ? (
                  <div className="ws-browser-viewport">
                    <iframe
                      src={`${session.viewUrl}${session.viewUrl?.includes("?") ? "&" : "?"}navbar=false`}
                      title={`${session.toolName} — live browser`}
                      sandbox="allow-same-origin allow-scripts"
                      allow="clipboard-read; clipboard-write"
                      referrerPolicy="no-referrer"
                    />
                    <div className="ws-browser-footer">
                      <span>Private browser · logins stay with this tool</span>
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          void perform("close", async () => {
                            await heartbeat(false);
                            await workspaceApi(
                              `sessions/${session.id}/close`,
                              {},
                            );
                            await refresh();
                          })
                        }
                      >
                        Close session
                      </button>
                    </div>
                    <form
                      className="ws-mobile-keyboard"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void perform("type", async () => {
                          await control("type", { text: mobileText });
                          setMobileText("");
                        });
                      }}
                    >
                      <input
                        type="password"
                        aria-label="Type into the focused browser field"
                        placeholder="Tap a field above, then type here"
                        autoComplete="off"
                        value={mobileText}
                        onChange={(e) => setMobileText(e.target.value)}
                      />
                      <button disabled={!mobileText || !!busy}>Type</button>
                      <button
                        type="button"
                        onClick={() =>
                          void perform("enter", () => control("enter"))
                        }
                      >
                        ↵
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="ws-browser-empty">
                    <div className="ws-browser-symbol">
                      <Glyph name="browser" />
                    </div>
                    <span className="ws-eyebrow">
                      YOUR TOOLS. YOUR WAY OF WORKING.
                    </span>
                    <h2>Bring your work into the room.</h2>
                    <p>
                      Open a website, connect an app, or import a file. Work
                      alongside {agentName}, with you in control of what it
                      sees.
                    </p>
                    <div className="ws-start-options">
                      <button
                        onClick={() => {
                          setAddType("web");
                          setAdd(true);
                        }}
                      >
                        <Glyph name="browser" />
                        <strong>Open a website</strong>
                        <span>Work in a private browser</span>
                      </button>
                      <button
                        onClick={() => {
                          setAddType("app");
                          setAdd(true);
                        }}
                      >
                        <Glyph name="plus" />
                        <strong>Connect an app</strong>
                        <span>Give your agent access</span>
                      </button>
                      <button
                        onClick={() => {
                          setAddType("file");
                          setAdd(true);
                        }}
                      >
                        <Glyph name="file" />
                        <strong>Bring a file</strong>
                        <span>Spreadsheets, documents & more</span>
                      </button>
                    </div>
                    <small>
                      Watching starts only when you choose. Instructions always
                      need your confirmation.
                    </small>
                  </div>
                )}
                {busy && (
                  <div className="ws-operation" role="status">
                    {busy === "open"
                      ? "Opening your private browser…"
                      : "Updating your workspace…"}
                  </div>
                )}
              </>
            )}
            {mode === "playbook" && (
              <div className="ws-playbook">
                <p className="ws-muted">
                  The instructions {agentName} follows. Proposals are kept
                  separate until you confirm them.
                </p>
                {proposals.length > 0 && (
                  <section>
                    <h2>
                      Ready for your review <span>{proposals.length}</span>
                    </h2>
                    {proposals.map(ruleCard)}
                  </section>
                )}
                {Object.entries(groups).map(([key, label]) => (
                  <section key={key}>
                    <h2>{label}</h2>
                    {state.rules
                      .filter((r) => r.group === key && r.status === "active")
                      .map(ruleCard)}
                    {!state.rules.some(
                      (r) => r.group === key && r.status === "active",
                    ) && (
                      <p className="ws-muted">
                        No confirmed instructions yet. Describe your preference
                        in the chat.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            )}
            {mode === "files" && (
              <div className="ws-files">
                <p className="ws-muted">
                  Import a file, open it, then ask your agent about its
                  contents. Select “Do a task” for work or “Learn together” to
                  turn it into instructions.
                </p>
                <button
                  className="ws-primary"
                  onClick={() => {
                    setAddType("file");
                    setAdd(true);
                  }}
                >
                  Import a file
                </button>
                <div className="ws-file-list">
                  {state.tools
                    .filter((t) => t.kind === "file")
                    .map((t) => (
                      <div key={t.id}>
                        <button
                          onClick={() =>
                            void perform("file", () => openTool(t))
                          }
                        >
                          <Glyph name="file" />
                          {t.name}
                          <span>Open →</span>
                        </button>
                        <button
                          aria-label={`Remove ${t.name}`}
                          onClick={() =>
                            void perform("delete", async () => {
                              await workspaceApi(`tools/${t.id}`, {}, "DELETE");
                              if (file?.id === t.id) setFile(null);
                              await refresh();
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                </div>
                {file && (
                  <div className="ws-file-view">
                    <div className="ws-file-title">
                      <h2>{file.name}</h2>
                      <button
                        onClick={() =>
                          void perform("download", () => downloadFile(file.id))
                        }
                      >
                        Download
                      </button>
                    </div>
                    <FileContent file={file} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        {chatPanel}
        {focus && (
          <button
            className="ws-agent-edge"
            onClick={() => setFocus(false)}
            title="Show agent panel"
          >
            <AgentAvatar size={25} />
            <span>{session?.watching ? "Watching" : agentName}</span>
            <Glyph name="chat" />
          </button>
        )}
      </div>

      <dialog
        ref={dialog}
        className="ws-dialog"
        onClose={() => setAdd(false)}
        aria-label="Integrations"
      >
        <div className="ws-dialog-head">
          <div>
            <span className="ws-eyebrow">MAKE THIS YOUR WORKSPACE</span>
            <h2>Integrations</h2>
          </div>
          <button aria-label="Close add tool" onClick={() => setAdd(false)}>
            <Glyph name="close" />
          </button>
        </div>
        <div className="ws-add-tabs">
          {(["web", "app", "file"] as const).map((k) => (
            <button
              key={k}
              aria-pressed={addType === k}
              onClick={() => setAddType(k)}
            >
              {k === "web" ? "Website" : k === "app" ? "Connected app" : "File"}
            </button>
          ))}
        </div>
        {error && (
          <div className="ws-error" role="alert">
            {error}
          </div>
        )}
        {addType === "web" && (
          <form className="ws-add-form" onSubmit={addWebsite}>
            <p>
              Open the tools you already use in a private browser. You’ll sign
              in on the website itself.
            </p>
            <label>
              Tool name
              <input
                name="name"
                placeholder="e.g. My CRM"
                required
                maxLength={80}
              />
            </label>
            <label>
              Website address
              <input
                name="url"
                placeholder="https://your-tool.com"
                required
                maxLength={2000}
                inputMode="url"
              />
            </label>
            <small>
              Some websites restrict cloud browsers. Opening the site is the
              compatibility check; connection alone doesn’t mean your agent can
              operate it.
            </small>
            <button className="ws-primary" disabled={!!busy}>
              {busy ? "Adding…" : "Add website"}
            </button>
          </form>
        )}
        {addType === "app" && !ghl && (
          <div className="ws-catalog">
            <p>
              Connect an account so {agentName} can use it. Review the
              permissions on the provider’s consent screen.
            </p>
            <input
              aria-label="Search apps"
              placeholder="Search apps…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {catalogLoading && <p role="status">Loading the app catalogue…</p>}
            <div className="ws-catalog-grid">
              {showHighLevel && (
                <button disabled={!!busy} onClick={() => setGhl(true)}>
                  <ToolMark
                    tool={{
                      name: "GoHighLevel",
                      logoUrl: "https://logos.composio.dev/api/highlevel",
                    }}
                  />
                  <strong>GoHighLevel</strong>
                  <span>Connect or manage ↗</span>
                </button>
              )}
              {foundApps.map((app) => (
                <button
                  key={app.key}
                  disabled={!!busy || connected.includes(app.key)}
                  onClick={() =>
                    void perform("connect", async () => {
                      const result = await workspaceApi("connect", {
                        slug: app.key,
                      });
                      if (result.redirectUrl)
                        window.location.assign(result.redirectUrl);
                      else {
                        await refresh();
                        setConnected((c) => [...c, app.key]);
                      }
                    })
                  }
                >
                  <ToolMark tool={{ name: app.name, logoUrl: app.logo }} />
                  <strong>{app.name}</strong>
                  <span>
                    {connected.includes(app.key) ? "Connected" : "Connect ↗"}
                  </span>
                </button>
              ))}
            </div>
            {!catalogLoading && foundApps.length === 0 && !showHighLevel && (
              <p>No matching apps. You can add the website instead.</p>
            )}
          </div>
        )}
        {addType === "app" && ghl && (
          <div className="ws-catalog">
            <div>
              <button
                type="button"
                className="btn-ghost text-[13px]"
                onClick={() => setGhl(false)}
              >
                ← All apps
              </button>
            </div>
            <HighLevelCard agentId={agentId} agentName={agentName} />
          </div>
        )}
        {addType === "file" && (
          <div className="ws-upload">
            <Glyph name="file" />
            <h3>Bring your knowledge with you.</h3>
            <p>
              Excel, CSV, PDF, Word, text or JSON. Up to 5 MB per file; 1,000
              rows per Excel sheet.
            </p>
            <label className="ws-primary">
              Choose a file
              <input
                type="file"
                accept=".xlsx,.csv,.pdf,.docx,.txt,.md,.json"
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void perform("upload", () => uploadFile(f));
                }}
              />
            </label>
            <small>
              {busy === "upload"
                ? "Reading your file…"
                : "Files stay in this workspace. Select one to use it in a conversation."}
            </small>
          </div>
        )}
      </dialog>
      <dialog
        ref={consentDialog}
        className="ws-dialog ws-consent"
        onClose={() => setConsent(false)}
        aria-label="Allow your agent to watch"
      >
        <span className="ws-eyebrow">YOU’RE IN CONTROL</span>
        <h2>Let {agentName} watch this website?</h2>
        <p className="ws-consent-site">
          {session?.url ? new URL(session.url).origin : ""}
        </p>
        <p>
          While watching, {agentName} reads visible page text and records the
          steps you take. It can ask questions and propose instructions.
        </p>
        <ul>
          <li>
            Watching stops when you hide the portal or leave this website. Start
            it again when you’re ready.
          </li>
          <li>
            Passwords, verification-code fields and typed input values aren’t
            included in learning records.
          </li>
          <li>
            Redacted step records are kept for 7 days. Your watch-time log and
            confirmed instructions remain available.
          </li>
          <li>
            Nothing becomes a permanent instruction until you confirm it in your
            Playbook.
          </li>
        </ul>
        <div className="ws-actions">
          <button onClick={() => setConsent(false)}>Keep watching off</button>
          <button
            className="ws-watch-start"
            disabled={!!busy}
            onClick={() => void perform("watch", () => setWatching(true))}
          >
            Allow watching
          </button>
        </div>
      </dialog>
      <dialog
        ref={editDialog}
        className="ws-dialog"
        onClose={() => setEdit(null)}
        aria-label="Edit instruction"
      >
        {edit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("text"));
              void perform("rule", () => decide(edit, "edit", value));
            }}
          >
            <h2>Edit this instruction</h2>
            <p>
              Your edit will be proposed for confirmation. The current
              instruction stays active until you approve its replacement.
            </p>
            <textarea
              key={edit.id}
              name="text"
              defaultValue={edit.text}
              required
              maxLength={600}
              rows={5}
            />
            <div className="ws-actions">
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="ws-primary" disabled={!!busy}>
                Review edit
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

function FileContent({ file }: { file: FileView }) {
  const rows = parseTable(
    file.content,
    file.name.endsWith(".xlsx") ? "\t" : ",",
  );
  const tabular = /\.(csv|xlsx)$/i.test(file.name);
  if (!tabular) return <div className="ws-document">{file.content}</div>;
  return (
    <div className="ws-sheet">
      <table>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
