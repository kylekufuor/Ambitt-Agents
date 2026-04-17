"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  role: string; // "agent" | "client"
  content: string;
  channel: string; // "email" | "chat" | "whatsapp"
  createdAt: string | Date;
}

function oracleUrl(): string {
  return process.env.NEXT_PUBLIC_ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "client",
      content: text,
      channel: "chat",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch(
        `${oracleUrl()}/chat/${agentId}/messages?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        }
      );

      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setDraft(text); // restore draft so client can retry
        return;
      }

      // Append agent reply
      setMessages((prev) => [
        ...prev,
        {
          id: `srv-${Date.now()}`,
          role: "agent",
          content: body.response,
          channel: "chat",
          createdAt: new Date().toISOString(),
        },
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
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-medium text-zinc-900">{agentName}</h1>
            <p className="text-sm text-zinc-500 capitalize">
              {agentStatus === "active" ? "Online" : agentStatus.replace("_", " ")}
            </p>
          </div>
          <a
            href="https://clients.ambitt.agency/"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition"
          >
            Portal
          </a>
        </div>
      </header>

      {/* Thread */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm text-zinc-500 py-10">
              Start the conversation. {agentName} reads every message.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
              {agentName} is thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* Composer */}
      <footer className="bg-white border-t border-zinc-200">
        <div className="max-w-3xl mx-auto px-6 py-3">
          {error && (
            <p className="text-sm text-red-600 mb-2">{error}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={8000}
              placeholder={`Message ${agentName}…`}
              className="flex-1 px-3 py-2 rounded-md bg-white border border-zinc-300 text-base text-zinc-900 resize-y min-h-[44px] max-h-[200px] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
              disabled={sending || agentStatus !== "active"}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim() || agentStatus !== "active"}
              className="h-9 px-4 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            ⌘/Ctrl + Enter to send
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

  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] ${isAgent ? "" : "items-end"}`}>
        <div
          className={`px-4 py-3 rounded-lg text-base whitespace-pre-wrap break-words ${
            isAgent
              ? "bg-white border border-zinc-200 text-zinc-900"
              : "bg-zinc-900 text-white"
          }`}
        >
          {message.content}
        </div>
        <div className={`flex items-center gap-2 mt-1 text-xs text-zinc-400 ${isAgent ? "" : "justify-end"}`}>
          <span>{isAgent ? agentName : "You"}</span>
          <span>·</span>
          <span>{timeLabel}</span>
          {message.channel === "email" && (
            <>
              <span>·</span>
              <span>via email</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
