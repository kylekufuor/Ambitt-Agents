"use client";

import { useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/brand-mark";

export interface ChatMessage {
  id: string;
  role: string; // "agent" | "client"
  content: string;
  channel: string; // "email" | "chat" | "whatsapp"
  createdAt: string | Date;
}

// Teal used for the client's own bubbles + markdown links. Aligned with the
// portal brand tokens (var(--brand) / var(--brand-hover)); kept as literals so
// they resolve inside the dangerouslySetInnerHTML markdown string too.
const BRAND = "#00a4bd";
const BRAND_HOVER = "#0091a8";

// Layered elevation — the same depth language as the portal's `.card`. Agent
// bubbles read as raised white surfaces, not gray-outlined boxes.
const BUBBLE_SHADOW =
  "0 0 0 1px rgba(45,62,80,0.04), 0 1px 2px rgba(45,62,80,0.06), 0 6px 16px -6px rgba(45,62,80,0.14)";

function oracleUrl(): string {
  return process.env.NEXT_PUBLIC_ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

// Escape HTML, then render a safe subset of markdown (bold, links, bullet +
// numbered lists, paragraphs) so agent replies read cleanly instead of showing
// raw ** and dashes.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${BRAND_HOVER};text-decoration:underline;font-weight:500;">$1</a>`
    );
}
function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { close(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,3}\s+(.*)/))) {
      close();
      out.push(`<p style="font-weight:600;margin:12px 0 4px;">${inline(m[1])}</p>`);
    } else if ((m = line.match(/^[-•]\s+(.*)/))) {
      if (list !== "ul") { close(); out.push(`<ul style="margin:4px 0 10px;padding-left:20px;">`); list = "ul"; }
      out.push(`<li style="margin:2px 0;">${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)/))) {
      if (list !== "ol") { close(); out.push(`<ol style="margin:4px 0 10px;padding-left:22px;">`); list = "ol"; }
      out.push(`<li style="margin:2px 0;">${inline(m[1])}</li>`);
    } else {
      close();
      out.push(`<p style="margin:0 0 10px;">${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}

function statusPresentation(status: string): { label: string; color: string; pulse: boolean } {
  if (status === "active") return { label: "Online", color: "var(--emerald)", pulse: true };
  if (status === "paused") return { label: "Paused", color: "var(--text-4)", pulse: false };
  if (status === "pending_approval") return { label: "Getting set up", color: "var(--blue)", pulse: true };
  return { label: status.replace(/_/g, " "), color: "var(--text-4)", pulse: false };
}

export function ChatView({
  agentId,
  agentName,
  agentStatus,
  token,
  initialMessages,
}: {
  agentId: string;
  agentName: string;
  agentStatus: string;
  token: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const status = statusPresentation(agentStatus);
  const canSend = agentStatus === "active";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "client", content: text, channel: "chat", createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      const res = await fetch(`${oracleUrl()}/chat/${agentId}/messages?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setDraft(text);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `srv-${Date.now()}`, role: "agent", content: body.response, channel: "chat", createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header — raised white bar, separated by elevation not a gray hairline */}
      <header
        className="sticky top-0 z-10"
        style={{
          background: "var(--surface)",
          boxShadow: "0 1px 2px rgba(45,62,80,0.06), 0 4px 16px -8px rgba(45,62,80,0.14)",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <AgentAvatar size={40} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[15px] text-[color:var(--text)] leading-tight truncate">
              {agentName}
              <span className="font-normal text-[color:var(--text-4)]"> · Ambitt Agents</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`dot ${status.pulse ? "dot-pulse" : ""}`}
                style={{
                  background: status.color,
                  boxShadow: status.pulse ? `0 0 0 3px color-mix(in srgb, ${status.color} 22%, transparent)` : "none",
                }}
              />
              <span className="text-[12px] text-[color:var(--text-3)]">{status.label}</span>
            </div>
          </div>
          <a
            href="https://portal.ambitt.agency/"
            className="text-[13px] font-medium text-[color:var(--text-3)] hover:text-[color:var(--brand-hover)] transition-colors"
          >
            Portal
          </a>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center py-16 px-6">
              <AgentAvatar size={56} />
              <h2 className="font-display text-[20px] text-[color:var(--text)] mt-5 leading-tight">
                Say hello to {agentName}.
              </h2>
              <p className="text-[14px] text-[color:var(--text-3)] mt-2 max-w-sm leading-relaxed">
                Ask a question, hand over a task, or just tell {agentName}{" "}what you need.
                Every message is read and answered right here — same as email, only faster.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} />
          ))}
          {sending && (
            <div className="flex items-end gap-2.5">
              <AgentAvatar size={30} />
              <div
                className="flex items-center gap-1 px-4 py-3.5 rounded-2xl rounded-bl-md"
                style={{ background: "var(--surface)", boxShadow: BUBBLE_SHADOW }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-4)", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-4)", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-4)", animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* Composer — raised bar with a polished field + confident teal send */}
      <footer
        style={{
          background: "var(--surface)",
          boxShadow: "0 -1px 2px rgba(45,62,80,0.05), 0 -8px 24px -12px rgba(45,62,80,0.16)",
        }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5">
          {error && (
            <p className="text-[13px] mb-2.5 flex items-center gap-1.5" style={{ color: "var(--red)" }}>
              <span className="dot dot-red" />
              {error}
            </p>
          )}
          {!canSend && (
            <p className="text-[12.5px] text-[color:var(--text-3)] mb-2.5">
              {agentName}{" "}is {statusPresentation(agentStatus).label.toLowerCase()} right now — messaging opens back up once it&apos;s live again.
            </p>
          )}
          <div className="flex items-end gap-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={8000}
              placeholder={`Message ${agentName}…`}
              className="flex-1 px-4 py-3 text-[15px] resize-none min-h-[48px] max-h-[200px] focus:outline-none transition-shadow"
              style={{
                background: canSend ? "var(--surface)" : "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-lg)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = BRAND;
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--brand-tint-strong)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
              disabled={sending || !canSend}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim() || !canSend}
              aria-label="Send message"
              className="btn-primary h-[48px] px-5 shrink-0"
              style={{ opacity: sending || !draft.trim() || !canSend ? 0.45 : 1 }}
            >
              Send
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12h13M12 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-[color:var(--text-4)] mt-2">
            Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  const isAgent = message.role === "agent";
  const date = new Date(message.createdAt);
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isAgent) {
    return (
      <div className="flex gap-2.5">
        <div className="mt-0.5 shrink-0">
          <AgentAvatar size={30} />
        </div>
        <div className="max-w-[82%]">
          <div
            className="px-4 py-3 rounded-2xl rounded-tl-md text-[15px] leading-relaxed break-words"
            style={{ background: "var(--surface)", color: "var(--text)", boxShadow: BUBBLE_SHADOW }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
          <div className="flex items-center gap-2 mt-1.5 ml-1 text-[11px] text-[color:var(--text-4)]">
            <span className="font-medium text-[color:var(--text-3)]">{agentName}</span>
            <span>·</span>
            <span>{timeLabel}</span>
            {message.channel === "email" && <><span>·</span><span>via email</span></>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[82%]">
        <div
          className="px-4 py-3 rounded-2xl rounded-tr-md text-[15px] text-white leading-relaxed whitespace-pre-wrap break-words"
          style={{ background: BRAND, boxShadow: "0 2px 10px -2px rgba(0,164,189,0.4)" }}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-2 mt-1.5 mr-1 justify-end text-[11px] text-[color:var(--text-4)]">
          <span className="font-medium text-[color:var(--text-3)]">You</span>
          <span>·</span>
          <span>{timeLabel}</span>
        </div>
      </div>
    </div>
  );
}
