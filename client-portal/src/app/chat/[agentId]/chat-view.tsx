"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  role: string; // "agent" | "client"
  content: string;
  channel: string; // "email" | "chat" | "whatsapp"
  createdAt: string | Date;
}

const BRAND = "#00b3b3";
const BRAND_DARK = "#0f7a74";
const AVATAR = "/brand/ambitt-agent-avatar.png";

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
      `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${BRAND_DARK};text-decoration:underline;">$1</a>`
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
  if (status === "active") return { label: "Online", color: BRAND, pulse: true };
  if (status === "paused") return { label: "Paused", color: "#9ca3af", pulse: false };
  if (status === "pending_approval") return { label: "Getting set up", color: "#3b82f6", pulse: true };
  return { label: status.replace(/_/g, " "), color: "#9ca3af", pulse: false };
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
    <div className="min-h-screen flex flex-col" style={{ background: "#f4f6f5" }}>
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AVATAR} alt={agentName} width={38} height={38} className="rounded-full" style={{ width: 38, height: 38 }} />
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-zinc-900 leading-tight">{agentName} <span className="font-normal text-zinc-400">· Ambitt Agents</span></h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: status.color, boxShadow: status.pulse ? `0 0 0 3px ${status.color}22` : "none" }} />
              <span className="text-[12px] text-zinc-500">{status.label}</span>
            </div>
          </div>
          <a href="https://portal.ambitt.agency/" className="text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors">Portal</a>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-[13px] text-zinc-500 py-12">
              Start the conversation — {agentName} reads every message and replies here.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} />
          ))}
          {sending && (
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATAR} alt="" width={28} height={28} className="rounded-full" style={{ width: 28, height: 28 }} />
              <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-zinc-200">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="bg-white border-t border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={8000}
              placeholder={`Message ${agentName}…`}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-zinc-300 text-[15px] text-zinc-900 resize-none min-h-[46px] max-h-[200px] focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": `${BRAND}55` } as React.CSSProperties}
              disabled={sending || agentStatus !== "active"}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim() || agentStatus !== "active"}
              className="h-[46px] px-5 rounded-xl text-white text-[14px] font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: BRAND }}
            >
              Send
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">Enter to send · Shift + Enter for a new line</p>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={AVATAR} alt={agentName} width={28} height={28} className="rounded-full mt-0.5 shrink-0" style={{ width: 28, height: 28 }} />
        <div className="max-w-[82%]">
          <div
            className="px-4 py-3 rounded-2xl rounded-tl-md bg-white border border-zinc-200 text-[15px] text-zinc-800 leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
          <div className="flex items-center gap-2 mt-1 ml-1 text-[11px] text-zinc-400">
            <span>{agentName}</span><span>·</span><span>{timeLabel}</span>
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
          style={{ background: BRAND }}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-2 mt-1 mr-1 justify-end text-[11px] text-zinc-400">
          <span>You</span><span>·</span><span>{timeLabel}</span>
        </div>
      </div>
    </div>
  );
}
