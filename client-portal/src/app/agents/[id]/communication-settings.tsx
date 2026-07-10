"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types — mirror shared/communication-settings.ts (kept loose on purpose)   */
/* -------------------------------------------------------------------------- */

type ChannelRef = {
  kind: "platform_email" | "platform_whatsapp" | "connected";
  slug?: string;
  connectionId?: string;
  address?: string;
} | null;

interface Settings {
  inbound: { allowedSenders: string[] };
  mfaRelay: ChannelRef;
  outbound: ChannelRef;
  signature: string | null;
  footer: string | null;
  bccAddresses: string[];
}

interface Options {
  ownerEmail: string | null;
  mfaChannels: { kind: string; label: string; available: boolean; address: string | null }[];
  outboundAccounts: {
    kind: string;
    label: string;
    address: string | null;
    connectionId: string | null;
    slug: string | null;
  }[];
}

const isEmail = (s: string) => /.+@.+\..+/.test(s.trim());

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function CommunicationSettings({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; err: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/communication-settings`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setLoadError(data.error ?? "Couldn't load communication settings.");
          return;
        }
        setSettings(data.settings);
        setOptions(data.options);
      } catch {
        if (alive) setLoadError("Network error loading communication settings.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [agentId]);

  // Persist the whole object (the endpoint replaces it). Optimistic: we already
  // set local state; this just writes through and flashes the result.
  async function persist(next: Settings) {
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/communication-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ msg: data.error ?? "Couldn't save", err: true });
        return;
      }
      if (data.settings) setSettings(data.settings); // adopt normalized version
      setFlash({ msg: "Saved", err: false });
    } catch {
      setFlash({ msg: "Network error — try again", err: true });
    } finally {
      setSaving(false);
    }
  }

  // Update local state + persist in one shot.
  function update(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    persist(next);
  }

  if (loadError) {
    return (
      <div className="card p-5 md:p-6">
        <p className="text-[13px] text-[color:var(--red)]">{loadError}</p>
      </div>
    );
  }

  if (!settings || !options) {
    return (
      <div className="card p-5 md:p-6">
        <p className="text-[13px] text-[color:var(--text-3)]">Loading…</p>
      </div>
    );
  }

  const mfaValue = settings.mfaRelay?.kind ?? "auto";
  const outboundValue =
    settings.outbound?.kind === "connected" ? settings.outbound.connectionId ?? "" : "default";

  return (
    <div className="space-y-4">
      {/* Save status (shared) */}
      {flash && (
        <div
          className={`text-[12px] ${
            flash.err ? "text-[color:var(--red)]" : "text-[color:var(--brand-hover)]"
          }`}
        >
          {flash.err ? flash.msg : "✓ Saved"}
        </div>
      )}

      {/* Who can email the agent */}
      <SettingCard
        title={`Who can email ${agentName}`}
        hint={`You can always email ${agentName}. Add teammates here so they can too — anyone else is politely ignored.`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {options.ownerEmail && (
            <span className="text-[12px] px-2 py-1 rounded-[8px] bg-[color:var(--surface-2)] border border-[color:var(--border)] text-[color:var(--text-2)]">
              {options.ownerEmail} <span className="text-[color:var(--text-4)]">· you</span>
            </span>
          )}
        </div>
        <EmailList
          values={settings.inbound.allowedSenders}
          disabled={saving}
          placeholder="teammate@yourcompany.com"
          addLabel="Add teammate"
          onChange={(allowedSenders) => update({ inbound: { allowedSenders } })}
        />
      </SettingCard>

      {/* MFA relay */}
      <SettingCard
        title="Verification codes"
        hint={`When ${agentName} needs a one-time code to sign in on your behalf, how should it reach you?`}
      >
        <OptionGrid cols={3}>
          <Opt
            selected={mfaValue === "auto"}
            disabled={saving}
            onClick={() => update({ mfaRelay: null })}
            label="Automatic"
            desc="WhatsApp if set up, otherwise email."
          />
          {options.mfaChannels.map((ch) => (
            <Opt
              key={ch.kind}
              selected={mfaValue === ch.kind}
              disabled={saving || !ch.available}
              onClick={() => update({ mfaRelay: { kind: ch.kind as NonNullable<ChannelRef>["kind"] } })}
              label={ch.label}
              desc={
                ch.available
                  ? ch.address ?? ch.label
                  : ch.kind === "platform_whatsapp"
                    ? "Add your number on the Tools page first."
                    : "Not available."
              }
            />
          ))}
        </OptionGrid>
      </SettingCard>

      {/* Outbound identity */}
      <SettingCard
        title="Send to your clients from"
        hint={`Which inbox ${agentName} sends outreach from. Replies land in that inbox. Ambitt's address is the default.`}
      >
        <OptionGrid cols={3}>
          {options.outboundAccounts.map((acc) => {
            const val = acc.kind === "connected" ? acc.connectionId ?? "" : "default";
            return (
              <Opt
                key={val || acc.label}
                selected={outboundValue === val}
                disabled={saving}
                onClick={() =>
                  update({
                    outbound:
                      acc.kind === "connected"
                        ? {
                            kind: "connected",
                            slug: acc.slug ?? "gmail",
                            connectionId: acc.connectionId ?? undefined,
                            address: acc.address ?? undefined,
                          }
                        : null,
                  })
                }
                label={acc.kind === "connected" ? acc.address ?? acc.label : acc.label}
                desc={acc.kind === "connected" ? "Your connected inbox" : "Sent from your agent's Ambitt address"}
              />
            );
          })}
        </OptionGrid>
        {options.outboundAccounts.length === 1 && (
          <p className="text-[12px] text-[color:var(--text-3)] mt-3">
            Want to send from your own address? Connect a Gmail on your{" "}
            <a href={`/agents/${agentId}/tools`} className="text-[color:var(--brand-hover)] hover:underline">
              Tools page
            </a>{" "}
            — add as many inboxes as you like.
          </p>
        )}
      </SettingCard>

      {/* Signature */}
      <SettingCard
        title="Email signature"
        hint={`Added to the bottom of emails ${agentName} sends on your behalf. Name, title, phone, a booking link.`}
      >
        <TextArea
          value={settings.signature ?? ""}
          disabled={saving}
          placeholder={`Best,\n${agentName}\nYour Company · (555) 123-4567`}
          onSave={(v) => update({ signature: v || null })}
        />
      </SettingCard>

      {/* Required footer */}
      <SettingCard
        title="Required footer"
        hint="Legal or compliance text added after the signature — a mailing address, an unsubscribe line, a disclaimer."
      >
        <TextArea
          value={settings.footer ?? ""}
          disabled={saving}
          placeholder="Your Company, 123 Main St, City, ST 00000 · Reply STOP to unsubscribe"
          onSave={(v) => update({ footer: v || null })}
        />
      </SettingCard>

      {/* Auto-BCC */}
      <SettingCard
        title="Blind-copy every send"
        hint="Automatically BCC these addresses on outbound email — handy for logging to your CRM's email drop-box."
      >
        <EmailList
          values={settings.bccAddresses}
          disabled={saving}
          placeholder="crm-dropbox@yourcompany.com"
          addLabel="Add BCC address"
          onChange={(bccAddresses) => update({ bccAddresses })}
        />
      </SettingCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editable email list                                                       */
/* -------------------------------------------------------------------------- */

function EmailList({
  values,
  disabled,
  placeholder,
  addLabel,
  onChange,
}: {
  values: string[];
  disabled: boolean;
  placeholder: string;
  addLabel: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!isEmail(v)) {
      setErr("That doesn't look like an email address.");
      return;
    }
    if (values.includes(v)) {
      setErr("Already added.");
      return;
    }
    setErr(null);
    setDraft("");
    onChange([...values, v]);
  }

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 text-[12.5px] px-2 py-1 rounded-[8px] bg-[color:var(--surface-2)] border border-[color:var(--border)] text-[color:var(--text-2)]"
            >
              {v}
              <button
                onClick={() => onChange(values.filter((x) => x !== v))}
                disabled={disabled}
                className="text-[color:var(--text-4)] hover:text-[color:var(--red)] disabled:opacity-50 leading-none"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="email"
          inputMode="email"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="flex-1 max-w-sm text-[13px] rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/25 focus:border-[color:var(--brand)]"
        />
        <button
          onClick={add}
          disabled={disabled || !draft.trim()}
          className="text-[12.5px] font-medium chip px-3 py-2 rounded-[10px] disabled:opacity-50"
        >
          {addLabel}
        </button>
      </div>
      {err && <p className="text-[12px] text-[color:var(--red)] mt-1.5">{err}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Save-on-blur textarea                                                     */
/* -------------------------------------------------------------------------- */

function TextArea({
  value,
  disabled,
  placeholder,
  onSave,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Keep in sync if the server normalizes/returns a different value.
  useEffect(() => setDraft(value), [value]);

  return (
    <textarea
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== (value ?? "").trim()) onSave(draft.trim());
      }}
      className="w-full text-[13px] leading-relaxed rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/25 focus:border-[color:var(--brand)] resize-y"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Presentational primitives (mirror agent-settings.tsx)                     */
/* -------------------------------------------------------------------------- */

function SettingCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-[15px] font-medium text-[color:var(--text)]">{title}</h3>
        <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[520px]">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function OptionGrid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const cls =
    cols === 2 ? "grid-cols-1 sm:grid-cols-2" : cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";
  return <div className={`grid ${cls} gap-2.5`}>{children}</div>;
}

function Opt({
  selected,
  disabled,
  onClick,
  label,
  desc,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-[12px] border px-3.5 py-3 transition disabled:opacity-50 ${
        selected ? "opt-selected" : "opt"
      }`}
    >
      <p
        className={`text-[13.5px] font-medium truncate ${
          selected ? "text-[color:var(--brand-hover)]" : "text-[color:var(--text)]"
        }`}
      >
        {label}
      </p>
      <p className="text-[12px] text-[color:var(--text-3)] mt-0.5 leading-snug">{desc}</p>
    </button>
  );
}
