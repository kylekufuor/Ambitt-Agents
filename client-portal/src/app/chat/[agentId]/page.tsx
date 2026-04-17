import { notFound } from "next/navigation";
import { ChatView, type ChatMessage } from "./chat-view";

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
    ?? "https://ambitt-agents-production.up.railway.app";
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
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
        <p className="text-base text-zinc-600 mt-2">{body}</p>
        <p className="text-sm text-zinc-500 mt-6">
          Email{" "}
          <a
            href="mailto:support@ambitt.agency"
            className="text-zinc-900 font-medium hover:underline"
          >
            support@ambitt.agency
          </a>{" "}
          if this keeps happening.
        </p>
      </div>
    </div>
  );
}
