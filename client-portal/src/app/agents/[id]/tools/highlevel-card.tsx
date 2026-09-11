"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/v3-ui";

interface ConnectionState { connected: boolean; locationId: string | null; token: string | null }
const disconnected: ConnectionState = { connected: false, locationId: null, token: null };
const docs = "https://help.gohighlevel.com/support/solutions/articles/155000005741";

export function HighLevelCard({ agentId, agentName }: { agentId: string; agentName: string }) {
  const id = useId();
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>(disconnected);
  const [pit, setPit] = useState("");
  const [locationId, setLocationId] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function request(action: string, credential?: { pit: string; locationId: string }) {
    const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tools/highlevel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(credential ? { credential } : {}) }),
    });
    const data = await response.json() as ConnectionState & { error?: string; toolCount?: number };
    if (!response.ok) throw new Error(data.error ?? "We couldn't update this connection.");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPit("");
    setEditing(false);
    setError(null);
    request("status").then((data) => {
      if (!cancelled) { setConnection(data); setLocationId(data.locationId ?? ""); }
    }).catch(() => { if (!cancelled) setError("We couldn't load your GoHighLevel connection. Refresh to try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // The endpoint is derived only from agentId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function act(action: "connect" | "test" | "disconnect") {
    setPending(action); setError(null); setNotice(null);
    try {
      const data = await request(action, action !== "disconnect" && editing ? { pit, locationId } : undefined);
      if (action === "test") setNotice(`Connection verified. ${data.toolCount ?? 0} tools are available.`);
      else {
        setConnection(data); setPit(""); setEditing(false); setConfirmDisconnect(false);
        setNotice(action === "connect" ? `GoHighLevel is connected for ${agentName}.` : "GoHighLevel is disconnected from your agents.");
        router.refresh();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn't update this connection."); }
    finally { setPending(null); }
  }

  return (
    <Panel className="mb-4">
      <div className="flex items-start gap-3.5">
        {/* GoHighLevel logo from the same asset provider as the Tools list. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://logos.composio.dev/api/highlevel" alt="" width={32} height={32} className="mt-0.5 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[15px] font-semibold">GoHighLevel</h2>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-3)]">
              <span className={`dot ${connection.connected ? "dot-emerald" : "dot-muted"}`} />
              {loading ? "Loading…" : connection.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="text-[13px] text-[color:var(--text-2)] mt-1 max-w-[65ch]">
            Let {agentName} work with your contacts, conversations, calendar and sales pipeline.
          </p>
          {!loading && !editing && (
            <div className="mt-3 space-y-3">
              {connection.connected && <p className="text-[12.5px] text-[color:var(--text-3)] break-all">Location {connection.locationId} · Token {connection.token}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-primary text-[13px] px-3.5 py-1.5" disabled={!!pending} onClick={() => { setEditing(true); setError(null); setNotice(null); setConfirmDisconnect(false); }}>
                  {connection.connected ? "Update connection" : "Connect GoHighLevel"}
                </button>
                {connection.connected && <>
                  <button className="btn-ghost text-[13px]" disabled={!!pending} onClick={() => void act("test")}>{pending === "test" ? "Testing…" : "Test connection"}</button>
                  <button className="btn-ghost text-[13px]" disabled={!!pending} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
                </>}
              </div>
              {confirmDisconnect && <div className="text-[13px] space-y-2">
                <p>This removes GoHighLevel access for every agent on your account. Your CRM records stay in GoHighLevel.</p>
                <button className="btn-primary text-[13px]" disabled={!!pending} onClick={() => void act("disconnect")}>{pending ? "Disconnecting…" : "Disconnect all agents"}</button>{" "}
                <button className="btn-ghost text-[13px]" disabled={!!pending} onClick={() => setConfirmDisconnect(false)}>Cancel</button>
              </div>}
            </div>
          )}
          {editing && <form className="mt-4 space-y-3 max-w-xl" onSubmit={(event) => { event.preventDefault(); void act("connect"); }}>
            <p className="text-[13px] font-medium">Connect with a Private Integration Token</p>
            <ol className="list-decimal pl-4 space-y-1 text-[12.5px] text-[color:var(--text-2)] leading-relaxed">
              <li>In your GoHighLevel sub-account, open Settings → Private Integrations → Create New Integration.</li>
              <li>Choose the contacts, conversations, calendars and opportunities permissions your agent needs. Include View Locations so we can verify the account.</li>
              <li>Copy the token, then find your Location ID in Settings → Business Profile.</li>
            </ol>
            <a href={docs} target="_blank" rel="noreferrer" className="inline-block text-[12.5px] text-[color:var(--brand-ink)] underline">GoHighLevel setup guide</a>
            <div>
              <label htmlFor={`${id}-token`} className="field-label">Private Integration Token</label>
              <input id={`${id}-token`} type="password" autoComplete="off" spellCheck={false} required disabled={!!pending} value={pit} onChange={(e) => setPit(e.target.value)} placeholder="pit-…" className="field" />
            </div>
            <div>
              <label htmlFor={`${id}-location`} className="field-label">Location ID</label>
              <input id={`${id}-location`} type="text" autoComplete="off" spellCheck={false} required disabled={!!pending} value={locationId} onChange={(e) => setLocationId(e.target.value)} className="field" />
            </div>
            <p className="text-[12px] text-[color:var(--text-3)]">We encrypt your token before saving it. Your agents share this GoHighLevel account. Their existing approval rules still apply.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary text-[13px] px-3.5 py-1.5" disabled={!!pending || !pit.trim() || !locationId.trim()}>{pending === "connect" ? "Verifying and saving…" : "Verify and connect"}</button>
              <button type="button" className="btn-ghost text-[13px]" disabled={!!pending || !pit.trim() || !locationId.trim()} onClick={() => void act("test")}>{pending === "test" ? "Testing…" : "Test connection"}</button>
              <button type="button" className="btn-ghost text-[13px]" disabled={!!pending} onClick={() => { setPit(""); setEditing(false); setError(null); setNotice(null); setLocationId(connection.locationId ?? ""); }}>Cancel</button>
            </div>
          </form>}
          {error && <p role="alert" className="mt-3 text-[12.5px] text-[color:var(--red)]">{error}</p>}
          {notice && <p role="status" className="mt-3 text-[12.5px] text-[color:var(--text-2)]">{notice}</p>}
        </div>
      </div>
    </Panel>
  );
}
