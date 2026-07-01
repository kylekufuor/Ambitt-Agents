"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

function statusBadge(status: ToolRow["status"]): { label: string; classes: string } {
  if (status === "connected") return { label: "Connected", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (status === "partial") return { label: "Partial", classes: "bg-blue-50 text-blue-700 border-blue-200" };
  return { label: "Needs setup", classes: "bg-amber-50 text-amber-700 border-amber-200" };
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
        className="w-9 h-9 rounded-lg border border-zinc-200 object-contain bg-white"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-semibold text-zinc-700">
      {initial}
    </div>
  );
}

export function ToolsList({ agentId, agentName, initialData }: ToolsListProps) {
  const [data] = useState(initialData);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Tools</h2>
        {data.tools.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 p-5 text-sm text-zinc-600 bg-zinc-50">
            No tools yet. {agentName} will email you when it needs access to something.
          </div>
        ) : (
          <ul className="space-y-2">
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
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Personal info</h2>
          <ul className="space-y-2">
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
    <li className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={row.name} logoUrl={row.logoUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-900">{row.name}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${badge.classes}`}>{badge.label}</span>
            {row.credentials?.allFilled && (
              <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100">🔒 Encrypted</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {row.accountEmail ? (
              <span className="text-zinc-700 font-medium">{row.accountEmail}</span>
            ) : isCustom ? (
              <>Sign-in{siteHost ? <> · {siteHost}</> : null}</>
            ) : (
              <>
                {row.authMethods.includes("oauth") && row.authMethods.includes("credentials") && <>OAuth + credentials</>}
                {row.authMethods.includes("oauth") && !row.authMethods.includes("credentials") && <>OAuth</>}
                {!row.authMethods.includes("oauth") && row.authMethods.includes("credentials") && <>Credentials</>}
              </>
            )}
            {last && <> · Last accessed {timeAgo(last)}</>}
          </p>
          {isCustom && row.vaultPending && (
            <p className="text-xs text-amber-700 mt-1">
              Your secure credential vault is being set up — you&apos;ll be able to add this login here shortly.
            </p>
          )}
          {connectError && <p className="text-xs text-red-600 mt-1">{connectError}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canConnectOAuth && (
            <button
              type="button"
              onClick={() => handleConnect(false)}
              disabled={connecting}
              className="text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md px-3 py-1.5 disabled:opacity-50"
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
              className="text-xs font-medium text-[color:var(--brand,#00b3b3)] hover:underline rounded-md px-2 py-1.5 disabled:opacity-50"
            >
              {connecting ? "…" : "+ Add another"}
            </button>
          )}
          {row.credentials && (
            <button
              type="button"
              onClick={onToggle}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-md px-3 py-1.5 hover:bg-zinc-50"
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
              className="text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md w-7 h-7 flex items-center justify-center disabled:opacity-50 transition-colors"
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
    <li className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={row.title} logoUrl={null} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-900">{row.title}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
              row.allFilled
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              {row.allFilled ? "Saved" : "Needs setup"}
            </span>
            <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100">🔒 Secured with 1Password</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {row.fields.map((f) => f.title).join(" · ")}
            {last && <> · Last accessed {timeAgo(last)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200 rounded-md px-3 py-1.5 hover:bg-zinc-50"
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
    <form onSubmit={onSubmit} className="border-t border-zinc-200 bg-zinc-50 px-4 py-4 space-y-3">
      {fields.map((f) => (
        <div key={f.title}>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            {f.title}
            {f.filled && <span className="ml-2 text-emerald-600 text-[10px] font-normal">(already saved — leave empty to keep)</span>}
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
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white"
              placeholder={f.filled ? "•••••••• (saved — leave empty to keep)" : `Enter ${f.title}`}
            />
            {isConcealed(f.fieldType) && (
              <button
                type="button"
                onClick={() => setShowByField({ ...showByField, [f.title]: !showByField[f.title] })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-700"
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
          className="text-sm font-medium px-4 py-2 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] text-zinc-500">🔒 Stored in 1Password — Ambitt doesn&apos;t keep your values</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
