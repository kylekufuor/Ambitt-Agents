export default function ChatLanding() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-zinc-50">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Chat with your agent</h1>
        <p className="text-base text-zinc-600 mt-2">
          Open the latest email from your agent and click the <strong>Chat with…</strong> link in
          the footer. That will bring you straight here.
        </p>
        <p className="text-sm text-zinc-500 mt-6">
          Need a hand? Email{" "}
          <a
            href="mailto:support@ambitt.agency"
            className="text-zinc-900 font-medium hover:underline"
          >
            support@ambitt.agency
          </a>
          .
        </p>
      </div>
    </div>
  );
}
