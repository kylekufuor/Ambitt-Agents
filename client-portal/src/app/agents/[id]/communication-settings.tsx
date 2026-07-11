"use client";

import { useEffect, useState } from "react";
import { ShieldIcon, MailIcon } from "@/components/icons";

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
        <div className="flex items-start gap-3.5">
          <span className="chip-icon chip-rose shrink-0" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <MailIcon size={19} />
          </span>
          <div>
            <p className="text-[14px] font-medium text-[color:var(--text)]">
              We couldn&apos;t load these settings
            </p>
            <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[460px]">
              {loadError} Give the page a refresh — if it keeps happening, reply to any of{" "}
              {agentName}&apos;s emails and we&apos;ll sort it out.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!settings || !options) {
    // Loading — skeleton rows that match the real cards, so nothing jumps.
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-5 md:p-6">
            <div className="flex items-start gap-3.5">
              <span
                className="chip-icon chip-teal shrink-0 animate-pulse"
                style={{ width: 34, height: 34, borderRadius: 10 }}
              />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-[color:var(--surface-2)] animate-pulse" />
                <div className="h-3 w-64 max-w-full rounded bg-[color:var(--surface-2)] animate-pulse" />
              </div>
            </div>
            <div className="mt-4 h-9 rounded-[10px] bg-[color:var(--surface-2)] animate-pulse" />
          </div>
        ))}
        <p className="text-[12.5px] text-[color:var(--text-3)] text-center">
          Pulling up how {agentName}{" "}communicates…
        </p>
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
        <div>
          <span
            className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full ${
              flash.err
                ? "bg-[color:var(--red-tint)] text-[color:var(--red)]"
                : "bg-[color:var(--brand-tint)] text-[color:var(--brand-hover)]"
            }`}
          >
            {flash.err ? flash.msg : "✓ Saved"}
          </span>
        </div>
      )}

      {/* Who can email the agent */}
      <SettingCard
        title={`Who can email ${agentName}`}
        hint={`You can always email ${agentName}. Add teammates here so they can too — anyone else is politely ignored.`}
        icon={<ShieldIcon size={19} />}
        accent="chip-emerald"
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
        hint={`When ${agentName}{" "}needs a one-time code to sign in on your behalf, how should it reach you?`}
        icon={<KeyIcon size={19} />}
        accent="chip-amber"
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
        hint={`Which inbox ${agentName}{" "}sends outreach from. Replies land in that inbox. Ambitt's address is the default.`}
        icon={<MailIcon size={19} />}
        accent="chip-teal"
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
        hint={`Added to the bottom of emails ${agentName}{" "}sends on your behalf. Name, title, phone, a booking link.`}
        icon={<PenIcon size={19} />}
        accent="chip-indigo"
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
        icon={<DocIcon size={19} />}
        accent="chip-violet"
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
        icon={<CopyIcon size={19} />}
        accent="chip-rose"
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

function SettingCard({
  title,
  hint,
  icon,
  accent = "chip-teal",
  children,
}: {
  title: string;
  hint: string;
  icon?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-start gap-3.5 mb-4">
        {icon && (
          <span className={`chip-icon ${accent} shrink-0`} style={{ width: 34, height: 34, borderRadius: 10 }}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium text-[color:var(--text)]">{title}</h3>
          <p className="text-[13px] text-[color:var(--text-3)] mt-0.5 max-w-[520px]">{hint}</p>
        </div>
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
      className={`text-left rounded-[12px] border px-3.5 py-3 transition duration-150 disabled:opacity-50 ${
        selected
          ? "opt-selected -translate-y-px shadow-[0_6px_16px_-8px_rgba(0,164,189,0.5)]"
          : "opt hover:-translate-y-px"
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

/* -------------------------------------------------------------------------- */
/*  Local duotone section icons (soft body + crisp detail + lit highlight)     */
/* -------------------------------------------------------------------------- */

function IconFrame({ size = 19, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

function KeyIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <circle cx="8.5" cy="8.5" r="4.6" fill="currentColor" opacity="0.2" />
      <path d="M11.7 11.7 19 19M15.4 15.4l1.8-1.8M17.2 17.2l1.6-1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="8.5" cy="8.5" r="4.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
      <path d="M6 6.2a.7.7 0 0 1 .5 1.2l-.9.9a.7.7 0 1 1-1-1l.9-.9a.7.7 0 0 1 .5-.2Z" fill="#fff" opacity="0.55" />
    </IconFrame>
  );
}

function PenIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M14.6 5.7 18.3 9.4 9.1 18.6l-4.2.6.6-4.2 9.1-9.3Z" fill="currentColor" opacity="0.2" />
      <path d="M14.9 4.7a1.2 1.2 0 0 1 1.7 0l2.7 2.7a1.2 1.2 0 0 1 0 1.7l-9 9a1 1 0 0 1-.55.28l-4.2.6a1 1 0 0 1-1.13-1.13l.6-4.2a1 1 0 0 1 .28-.55l9-9Zm.85 2-8.4 8.4-.32 2.25 2.25-.32 8.4-8.4-1.93-1.93Z" fill="currentColor" />
      <path d="M6.2 13.6a.7.7 0 0 1 .5 1.2l-1 .95a.7.7 0 1 1-1-1l1-.95a.7.7 0 0 1 .5-.2Z" fill="#fff" opacity="0.55" />
    </IconFrame>
  );
}

function DocIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h5l4 4v11.5A1.5 1.5 0 0 1 15.5 20h-7A1.5 1.5 0 0 1 7 18.5" fill="currentColor" opacity="0.2" />
      <path d="M8 2.4A2.1 2.1 0 0 0 5.9 4.5v15A2.1 2.1 0 0 0 8 21.6h8a2.1 2.1 0 0 0 2.1-2.1V7.4a1 1 0 0 0-.3-.72l-4-4a1 1 0 0 0-.72-.3H8Zm.1 1.8h5v3a1.4 1.4 0 0 0 1.4 1.4h2v11.1a.3.3 0 0 1-.3.3h-8a.3.3 0 0 1-.3-.3V4.5a.3.3 0 0 1 .3-.3Z" fill="currentColor" />
      <rect x="8.8" y="12" width="6.4" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="8.8" y="15" width="4.4" height="1.6" rx="0.8" fill="currentColor" opacity="0.55" />
      <path d="M8 5.1h2.8a.7.7 0 0 1 0 1.4H8a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.55" />
    </IconFrame>
  );
}

function CopyIcon({ size }: { size?: number }) {
  return (
    <IconFrame size={size}>
      <rect x="8" y="8" width="11" height="11" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="8" y="8" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <path d="M15.5 6.2A3 3 0 0 0 13 5H8a3 3 0 0 0-3 3v5a3 3 0 0 0 1.2 2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M10 12.8h5M10 15.4h3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 9.4h3a.7.7 0 0 1 0 1.4h-3a.7.7 0 0 1 0-1.4Z" fill="#fff" opacity="0.5" />
    </IconFrame>
  );
}
