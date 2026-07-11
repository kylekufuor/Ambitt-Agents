import { notFound } from "next/navigation";
import { ChatView, type ChatMessage } from "./chat-view";
import { BrandLockup } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

interface HistoryResponse {
  agentId: string;
  agentName: string;
  agentStatus: string;
  threadId: string;
  messages: ChatMessage[];
}

function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://oracle-production-c0ff.up.railway.app";
}

export default async function ChatPage(
  { params, searchParams }: {
    params: Promise<{ agentId: string }>;
    searchParams: Promise<{ t?: string }>;
  }
) {
  const { agentId } = await params;
  const { t: token } = await searchParams;

  if (!token) {
    return (
      <ErrorScreen
        title="Link expired or incomplete"
        body="This chat link is missing its access token. Open the latest email from your agent and click the chat link there."
      />
    );
  }

  const res = await fetch(
    `${oracleUrl()}/chat/${agentId}/history?t=${encodeURIComponent(token)}`,
    { cache: "no-store" }
  );

  if (res.status === 401 || res.status === 403) {
    return (
      <ErrorScreen
        title="This chat link isn't valid"
        body="The token in this link has expired or doesn't match. Click a newer chat link from one of your agent's emails."
      />
    );
  }

  if (res.status === 404) notFound();

  if (!res.ok) {
    return (
      <ErrorScreen
        title="Chat unavailable"
        body={`Something went wrong loading the conversation (${res.status}). Please try again shortly.`}
      />
    );
  }

  const data = (await res.json()) as HistoryResponse;

  return (
    <ChatView
      agentId={agentId}
      agentName={data.agentName}
      agentStatus={data.agentStatus}
      token={token}
      initialMessages={data.messages}
    />
  );
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="page-wash flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full">
        <div className="flex justify-center mb-8">
          <BrandLockup height={22} />
        </div>
        <div className="card p-8 sm:p-10 text-center relative overflow-hidden">
          <span className="accent-stripe warn" />
          <div className="flex justify-center mb-5">
            <span className="chip-icon chip-amber" style={{ width: 48, height: 48 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3.2 21 19H3L12 3.2Z" fill="currentColor" opacity="0.2" />
                <path d="M12 3.4a1.4 1.4 0 0 1 1.22.7l8 13.9A1.4 1.4 0 0 1 20 20.1H4a1.4 1.4 0 0 1-1.22-2.1l8-13.9A1.4 1.4 0 0 1 12 3.4Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
                <path d="M12 9.5v4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16.6" r="1.1" fill="currentColor" />
              </svg>
            </span>
          </div>
          <p className="eyebrow mb-2.5" style={{ color: "#b45309" }}>Chat link</p>
          <h1 className="font-display text-[23px] leading-tight text-[color:var(--text)]">{title}</h1>
          <p className="text-[14.5px] text-[color:var(--text-3)] mt-3 leading-relaxed max-w-md mx-auto">
            {body}
          </p>

          <div className="hairline my-7" />

          <p className="text-[13px] text-[color:var(--text-3)]">
            Still stuck? We&apos;ll sort it out — write to{" "}
            <a
              href="mailto:support@ambitt.agency"
              className="font-medium text-[color:var(--brand-hover)] hover:underline"
            >
              support@ambitt.agency
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
