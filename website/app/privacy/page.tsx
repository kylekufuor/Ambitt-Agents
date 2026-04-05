import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Ambitt Agents",
  description: "How Ambitt Agents collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      <section className="relative pt-36 pb-28 px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.03)_0%,transparent_60%)]" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="label-pill mb-6">Legal</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm mb-16">Last updated April 4, 2026</p>

          <div className="space-y-12 text-sm leading-relaxed text-muted-foreground">
            <Section title="1. Information We Collect">
              <p>We collect personal information you provide voluntarily, including your name, email address, business name, and other contact details when you create an account, connect tools, or contact us.</p>
              <p>We also collect usage data automatically, including IP addresses, browser type, device information, and pages visited, for the purpose of improving our services.</p>
            </Section>

            <Section title="2. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-3 text-muted-foreground/80">
                <li>Operate and maintain your AI agents and tool connections</li>
                <li>Send agent communications (reports, alerts, digests) to your email</li>
                <li>Process billing and manage your subscription</li>
                <li>Improve our services and develop new features</li>
                <li>Respond to support requests and inquiries</li>
              </ul>
            </Section>

            <Section title="3. Data Security">
              <p>All client credentials (API keys, OAuth tokens) are encrypted at rest using AES-256-GCM encryption. Each agent is fully isolated per client — credentials, memory, and conversation history are never shared between clients.</p>
              <p>We never log sensitive credentials in plaintext. All data is transmitted over HTTPS. Our infrastructure is hosted on Railway with PostgreSQL databases on Supabase.</p>
            </Section>

            <Section title="4. Information Sharing">
              <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent. Third-party service providers (Resend for email, Stripe for billing, Composio for tool connections) may receive data necessary to provide their services.</p>
            </Section>

            <Section title="5. Tool Connections & Client Data">
              <p>When you connect tools (e.g., Salesforce, PostHog, Slack), your agent accesses data from those tools on your behalf. This data is used solely to perform the tasks you request and is not shared with other clients or used for any other purpose.</p>
              <p>You can disconnect any tool at any time from the dashboard. Disconnecting a tool immediately revokes the agent&apos;s access.</p>
            </Section>

            <Section title="6. Cookies">
              <p>Our website and dashboard use cookies to enhance your experience. You can control cookies through your browser settings, though disabling them may limit functionality.</p>
            </Section>

            <Section title="7. Your Rights">
              <p>You can manage your communication preferences, request access to your data, request deletion of your account and all associated data, or unsubscribe from any communications at any time. Contact us at support@ambitt.agency for any data requests.</p>
            </Section>

            <Section title="8. Children&apos;s Privacy">
              <p>Our services are not directed at individuals under the age of 18. If we discover that we have collected personal information from a minor, we will take steps to remove that information promptly.</p>
            </Section>

            <Section title="9. Changes to This Policy">
              <p>We may update this privacy policy from time to time. Changes will be posted on this page. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
            </Section>

            <Section title="10. Contact">
              <p>Questions about this privacy policy? Contact us at <a href="mailto:support@ambitt.agency" className="text-accent hover:underline">support@ambitt.agency</a>.</p>
            </Section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground font-semibold text-xl mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
