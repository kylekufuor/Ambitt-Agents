"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ToolsIcon, ShieldIcon } from "@/components/icons";

interface FieldShape {
  title: string;
  fieldType: string;
  filled: boolean;
}

interface ToolRow {
  id: string;
  name: string;
  logoUrl: string | null;
  category: string | null;
  authMethods: Array<"oauth" | "credentials">;
  status: "connected" | "needs_setup" | "partial";
  oauth: { connectionId: string; connectedAt: string | null } | null;
  credentials: {
    itemId: string;
    fields: FieldShape[];
    allFilled: boolean;
    lastAccessedAt: string | null;
  } | null;
  // Custom (non-Composio) tools the agent signs into with client-entered
  // credentials. vaultPending = the client's secure vault isn't ready yet.
  source?: "composio" | "custom";
  siteUrl?: string | null;
  vaultPending?: boolean;
  accountEmail?: string | null; // which inbox (Gmail can have several)
  appSlug?: string | null; // for "Add another account"
  loginStatus?: "ok" | "failed" | null; // last browser login outcome (custom tools)
  loginError?: string | null;
}

interface PersonalInfoRow {
  itemId: string;
  title: string;
  fields: FieldShape[];
  allFilled: boolean;
  lastAccessedAt: string | null;
}

interface ToolsListProps {
  agentId: string;
  agentName: string;
  initialData: { tools: ToolRow[]; personalInfo: PersonalInfoRow[] };
}

function statusBadge(status: ToolRow["status"]): { label: string; pill: string; dot: string } {
  if (status === "connected") return { label: "Connected", pill: "pill-emerald", dot: "dot-emerald" };
  if (status === "partial") return { label: "Almost there", pill: "pill-blue", dot: "dot-blue" };
  return { label: "Needs setup", pill: "pill-amber", dot: "dot-amber" };
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="w-9 h-9 rounded-[9px] object-contain bg-[color:var(--surface)]"
        style={{ boxShadow: "inset 0 0 0 1px rgba(45,62,80,0.08), 0 1px 2px rgba(45,62,80,0.08)" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-[9px] bg-[color:var(--surface-2)] flex items-center justify-center text-sm font-semibold text-[color:var(--text-2)]"
      style={{ boxShadow: "inset 0 0 0 1px rgba(45,62,80,0.06)" }}
    >
      {initial}
    </div>
  );
}

export function ToolsList({ agentId, agentName, initialData }: ToolsListProps) {
  const [data] = useState(initialData);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-9">
      <section>
        <h2 className="eyebrow mb-3">Tools</h2>
        {data.tools.length === 0 ? (
          <div className="card p-8 text-center">
            <span className="chip-icon chip-teal mx-auto mb-4">
              <ToolsIcon size={20} />
            </span>
            <p className="font-display text-[17px] text-[color:var(--text)]">
              Nothing to connect yet
            </p>
            <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5 max-w-sm mx-auto leading-relaxed">
              When {agentName}{" "}needs access to one of your accounts, it&apos;ll ask you here
              and send you a heads-up by email. Nothing for you to do right now.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.tools.map((t) => (
              <ToolItem
                key={t.id}
                agentId={agentId}
                row={t}
                isExpanded={expanded === t.id}
                onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {data.personalInfo.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3">Personal info</h2>
          <ul className="space-y-2.5">
            {data.personalInfo.map((p) => (
              <PersonalInfoItem
                key={p.itemId}
                agentId={agentId}
                row={p}
                isExpanded={expanded === `pi:${p.itemId}`}
                onToggle={() => setExpanded(expanded === `pi:${p.itemId}` ? null : `pi:${p.itemId}`)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ToolItem({
  agentId, row, isExpanded, onToggle,
}: {
  agentId: string;
  row: ToolRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const badge = statusBadge(row.status);
  const last = row.credentials?.lastAccessedAt ?? null;
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const isCustom = row.source === "custom";
  const siteHost = (() => {
    if (!row.siteUrl) return null;
    try { return new URL(row.siteUrl).hostname.replace(/^www\./, ""); } catch { return null; }
  })();

  // OAuth tools not yet connected get a "Connect" button. It asks the server
  // for a Composio OAuth link (scoped to this client) and sends the browser
  // there; Google consent, then Composio redirects back to this page.
  const canConnectOAuth = row.authMethods.includes("oauth") && !row.oauth;

  async function handleConnect(force = false) {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tools/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // force=true → "Add another account" (connect a second inbox even
        // though one is already linked).
        body: JSON.stringify({ appName: row.appSlug ?? row.name, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnectError(data.error ?? `Connect failed (${res.status})`);
        setConnecting(false);
        return;
      }
      if (data.alreadyConnected) {
        window.location.reload();
        return;
      }
      if (data.oauthUrl) {
        window.location.href = data.oauthUrl;
        return;
      }
      setConnectError("No authorization link returned");
      setConnecting(false);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connect failed");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const label = isCustom
      ? `Remove ${row.name} and delete its saved login?`
      : `Disconnect ${row.name}? ${row.name} will lose access until you reconnect it.`;
    if (!window.confirm(label)) return;
    setDisconnecting(true);
    setConnectError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tools/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // custom or a specific account (Gmail) → remove just this connection;
        // a plain single-account OAuth tool → remove the whole app.
        body: JSON.stringify(
          isCustom || row.accountEmail ? { toolId: row.id } : { appName: row.appSlug ?? row.name }
        ),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setConnectError(b.error ?? "Couldn't disconnect");
        setDisconnecting(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Couldn't disconnect");
      setDisconnecting(false);
    }
  }

  const canDisconnect = !!row.oauth || (isCustom && !!row.credentials?.allFilled);

  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <Avatar name={row.name} logoUrl={row.logoUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[color:var(--text)]">{row.name}</p>
            {row.loginStatus === "failed" ? (
              <span className="pill pill-red">
                <span className="dot dot-red" />
                Sign-in failed
              </span>
            ) : (
              <span className={`pill ${badge.pill}`}>
                <span className={`dot ${badge.dot}`} />
                {badge.label}
              </span>
            )}
            {row.credentials?.allFilled && row.loginStatus !== "failed" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--text-3)]">
                <span className="text-[color:var(--emerald)]"><ShieldIcon size={13} /></span>
                Encrypted
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">
            {row.accountEmail ? (
              <span className="text-[color:var(--text-2)] font-medium">{row.accountEmail}</span>
            ) : isCustom ? (
              <>Sign-in{siteHost ? <> · {siteHost}</> : null}</>
            ) : (
              <>
                {row.authMethods.includes("oauth") && row.authMethods.includes("credentials") && <>Sign-in + saved login</>}
                {row.authMethods.includes("oauth") && !row.authMethods.includes("credentials") && <>One-click sign-in</>}
                {!row.authMethods.includes("oauth") && row.authMethods.includes("credentials") && <>Saved login</>}
              </>
            )}
            {last && <> · Last used {timeAgo(last)}</>}
          </p>
          {isCustom && row.vaultPending && (
            <p className="text-[12.5px] text-[color:var(--amber)] mt-1.5 leading-relaxed">
              We&apos;re still setting up your secure vault — you&apos;ll be able to add this login here in a moment.
            </p>
          )}
          {row.loginStatus === "failed" && (
            <p className="text-[12.5px] text-[color:var(--red)] mt-1.5 leading-relaxed">
              That saved login didn&apos;t work for {row.name}. Pop in a fresh username and password
              below and we&apos;ll try again on the next run.
            </p>
          )}
          {connectError && <p className="text-[12.5px] text-[color:var(--red)] mt-1.5">{connectError}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canConnectOAuth && (
            <button
              type="button"
              onClick={() => handleConnect(false)}
              disabled={connecting}
              className="btn-primary text-[13px] px-3.5 py-1.5"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          )}
          {row.appSlug === "gmail" && row.status === "connected" && (
            <button
              type="button"
              onClick={() => handleConnect(true)}
              disabled={connecting}
              title="Connect another Gmail inbox"
              className="text-[13px] font-medium text-[color:var(--brand-hover)] hover:underline rounded-md px-2 py-1.5 disabled:opacity-50"
            >
              {connecting ? "…" : "+ Add another"}
            </button>
          )}
          {row.credentials && (
            <button
              type="button"
              onClick={onToggle}
              className="btn-secondary text-[13px] px-3.5 py-1.5"
            >
              {row.credentials.allFilled ? "Update" : isCustom ? "Enter login" : "Add credentials"}
            </button>
          )}
          {canDisconnect && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              title={isCustom ? "Remove this tool" : "Disconnect"}
              aria-label={isCustom ? `Remove ${row.name}` : `Disconnect ${row.name}`}
              className="text-[color:var(--text-4)] hover:text-[color:var(--red)] rounded-md w-7 h-7 flex items-center justify-center disabled:opacity-50 transition-colors"
              style={{ transitionProperty: "color, background-color" }}
            >
              {disconnecting ? (
                <span className="text-[10px]">…</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              )}
            </button>
          )}
        </div>
      </div>
      {isExpanded && row.credentials && (
        <CredentialForm
          agentId={agentId}
          itemId={row.credentials.itemId}
          fields={row.credentials.fields}
          onDone={onToggle}
          customToolName={isCustom ? row.name : undefined}
        />
      )}
    </li>
  );
}

function PersonalInfoItem({
  agentId, row, isExpanded, onToggle,
}: {
  agentId: string;
  row: PersonalInfoRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const last = row.lastAccessedAt;
  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <Avatar name={row.title} logoUrl={null} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[color:var(--text)]">{row.title}</p>
            <span className={`pill ${row.allFilled ? "pill-emerald" : "pill-amber"}`}>
              <span className={`dot ${row.allFilled ? "dot-emerald" : "dot-amber"}`} />
              {row.allFilled ? "Saved" : "Needs setup"}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--text-3)]">
              <span className="text-[color:var(--emerald)]"><ShieldIcon size={13} /></span>
              Kept in your vault
            </span>
          </div>
          <p className="text-[12.5px] text-[color:var(--text-3)] mt-1">
            {row.fields.map((f) => f.title).join(" · ")}
            {last && <> · Last used {timeAgo(last)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="btn-secondary text-[13px] px-3.5 py-1.5"
        >
          {row.allFilled ? "Update" : "Fill in"}
        </button>
      </div>
      {isExpanded && (
        <CredentialForm
          agentId={agentId}
          itemId={row.itemId}
          fields={row.fields}
          onDone={onToggle}
        />
      )}
    </li>
  );
}

function CredentialForm({
  agentId, itemId, fields, onDone, customToolName,
}: {
  agentId: string;
  itemId: string;
  fields: FieldShape[];
  onDone: () => void;
  // When set, this is a non-Composio browser-login tool (e.g. CoStar) — save to
  // the DB-backed encrypted store instead of 1Password.
  customToolName?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.title, ""]))
  );
  const [showByField, setShowByField] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fieldValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim().length > 0) fieldValues[k] = v;
      }
      if (Object.keys(fieldValues).length === 0) {
        setError("Fill in at least one field.");
        setSaving(false);
        return;
      }
      const res = customToolName
        ? await fetch(`/api/agents/${agentId}/tools/custom-credentials`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolName: customToolName, fields: fieldValues }),
          })
        : await fetch(`/api/agents/${agentId}/tools/credentials/${itemId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fieldValues }),
          });
      const body = await res.json().catch(() => ({ error: "Save failed" }));
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        setSaving(false);
        return;
      }
      // Clear in-memory values immediately on success
      setValues(Object.fromEntries(fields.map((f) => [f.title, ""])));
      onDone();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  const isConcealed = (t: string) => t === "Concealed" || t === "Totp";

  return (
    <form
      onSubmit={onSubmit}
      className="px-4 py-4 space-y-3.5"
      style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}
    >
      {fields.map((f) => (
        <div key={f.title}>
          <label className="field-label">
            {f.title}
            {f.filled && <span className="ml-2 text-[color:var(--emerald)] text-[11px] font-normal">already saved — leave empty to keep</span>}
          </label>
          <div className="relative">
            <input
              type={isConcealed(f.fieldType) && !showByField[f.title] ? "password" : "text"}
              autoComplete={
                f.title.toLowerCase().includes("password")
                  ? "current-password"
                  : f.title.toLowerCase().includes("user") || f.title.toLowerCase().includes("email")
                  ? "username"
                  : "off"
              }
              value={values[f.title] ?? ""}
              onChange={(e) => setValues({ ...values, [f.title]: e.target.value })}
              disabled={saving}
              className="field pr-14"
              placeholder={f.filled ? "•••••••• (saved — leave empty to keep)" : `Enter ${f.title}`}
            />
            {isConcealed(f.fieldType) && (
              <button
                type="button"
                onClick={() => setShowByField({ ...showByField, [f.title]: !showByField[f.title] })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-[color:var(--text-3)] hover:text-[color:var(--text)]"
                tabIndex={-1}
              >
                {showByField[f.title] ? "Hide" : "Show"}
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary text-[13.5px] px-4 py-2"
        >
          {saving ? "Saving…" : "Save login"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="btn-secondary text-[13.5px] px-4 py-2"
        >
          Cancel
        </button>
      </div>

      <p className="flex items-center gap-1.5 text-[11.5px] text-[color:var(--text-3)] leading-relaxed">
        <span className="text-[color:var(--emerald)] shrink-0"><ShieldIcon size={14} /></span>
        Encrypted in your own vault the moment you save — we never see or keep the values.
      </p>

      {error && <p className="text-[12.5px] text-[color:var(--red)]">{error}</p>}
    </form>
  );
}
