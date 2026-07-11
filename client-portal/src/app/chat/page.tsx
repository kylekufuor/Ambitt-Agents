import { BrandLockup, AgentAvatar } from "@/components/brand-mark";
import { ChatIcon } from "@/components/icons";

export default function ChatLanding() {
  return (
    <div className="page-wash flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full">
        <div className="flex justify-center mb-8">
          <BrandLockup height={22} />
        </div>

        <div className="card p-8 sm:p-10 text-center relative overflow-hidden">
          <span className="accent-stripe" />
          <div className="flex justify-center mb-5">
            <AgentAvatar size={56} />
          </div>
          <p className="eyebrow mb-2.5">Chat with your agent</p>
          <h1 className="font-display text-[24px] leading-tight text-[color:var(--text)]">
            One tap and you&apos;re in the conversation
          </h1>
          <p className="text-[14.5px] text-[color:var(--text-3)] mt-3 leading-relaxed max-w-md mx-auto">
            Open the latest email from your agent and tap the{" "}
            <span className="inline-flex items-center gap-1 font-medium text-[color:var(--text-2)]">
              <ChatIcon size={15} />Chat with…
            </span>{" "}
            link in the footer. That brings you straight here, signed in and ready.
          </p>

          <div className="hairline my-7" />

          <p className="text-[13px] text-[color:var(--text-3)]">
            Can&apos;t find it? We&apos;re a quick note away at{" "}
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
