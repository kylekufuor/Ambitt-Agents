import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Ambitt Agents",
  description: "How Ambitt Agents collects, uses, and protects your information, including mobile phone numbers and SMS consent.",
};

export default function PrivacyPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      <section className="relative pt-16 pb-28 px-6">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="label-pill mb-6">Legal</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm mb-8">Last updated July 23, 2026</p>

          <p className="text-sm leading-relaxed text-muted-foreground mb-16 max-w-2xl">
            Ambitt Agents is a service of <span className="text-foreground/90">Kufgroup LLC</span>{" "}(d/b/a Ambitt Agents),
            operating at ambitt.agency. This policy explains what we collect, how we use it, and the choices you have.
            When we say &ldquo;we&rdquo; or &ldquo;our team,&rdquo; we mean Kufgroup LLC.
          </p>

          <div className="space-y-12 text-sm leading-relaxed text-muted-foreground">
            <Section title="1. Information We Collect">
              <p>We collect personal information you provide voluntarily, including your name, email address, business name, and other contact details when you create an account, connect tools, or contact us.</p>
              <p>If you choose to receive text messages from us, we also collect the mobile phone number you provide and a record of your consent.</p>
              <p>We collect usage data automatically, including IP addresses, browser type, device information, and pages visited, for the purpose of improving our services.</p>
            </Section>

            <Section title="2. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-3 text-muted-foreground/80">
                <li>Operate and maintain your AI agents and tool connections</li>
                <li>Send agent communications (reports, alerts, digests) to your email</li>
                <li>Send account and login-verification text messages to the mobile number you opted in with</li>
                <li>Process billing and manage your subscription</li>
                <li>Improve our services and develop new features</li>
                <li>Respond to support requests and inquiries</li>
              </ul>
            </Section>

            <Section title="3. Mobile Information & SMS Text Messaging">
              <p>When you give us your mobile phone number and opt in through your client portal, we use it to send you transactional text messages — specifically account notifications and login-verification requests tied to work you&apos;ve asked your agent to do. We record your consent, together with a timestamp, at the moment you check the opt-in box.</p>
              <p className="text-foreground/90 font-medium">No mobile information will ever be shared with third parties or affiliates for marketing or promotional purposes. We do not sell, rent, or share the mobile phone numbers or SMS opt-in data of our clients with anyone. Text-messaging originator opt-in data and consent are never shared with any third parties.</p>
              <p>Message frequency varies, and message and data rates may apply. You can reply STOP to any message to opt out of text messages at any time, or HELP for help. Opting out of texts doesn&apos;t affect the rest of your service.</p>
            </Section>

            <Section title="4. Data Security">
              <p>All client credentials (API keys, OAuth tokens) are encrypted at rest using AES-256-GCM encryption. Each agent is fully isolated per client — credentials, memory, and conversation history are never shared between clients.</p>
              <p>We never log sensitive credentials in plaintext. All data is transmitted over HTTPS. Our infrastructure is hosted on Railway with PostgreSQL databases on Supabase.</p>
            </Section>

            <Section title="5. Information Sharing">
              <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent. Third-party service providers (Resend for email, Twilio for text messaging, Stripe for billing, Composio for tool connections) may receive the data necessary to provide their services, and only for that purpose. As stated above, we never share your mobile number or SMS consent for marketing.</p>
            </Section>

            <Section title="6. Data Retention">
              <p>We keep your personal information for as long as your account is active and for as long as we need it to provide the service. When you close your account, we delete your data — including agent memory, conversation history, and connected-tool credentials — within 30 days, except where we&apos;re required to keep certain records (for example, billing history) to meet legal or tax obligations.</p>
              <p>You can request deletion of your account and associated data at any time by emailing <a href="mailto:support@ambitt.agency" className="text-accent hover:underline">support@ambitt.agency</a>.</p>
            </Section>

            <Section title="7. Tool Connections & Client Data">
              <p>When you connect tools (e.g., Salesforce, PostHog, Slack), your agent accesses data from those tools on your behalf. This data is used solely to perform the tasks you request and is not shared with other clients or used for any other purpose.</p>
              <p>You can disconnect any tool at any time from the dashboard. Disconnecting a tool immediately revokes the agent&apos;s access.</p>
            </Section>

            <Section title="8. Cookies">
              <p>Our website and dashboard use cookies to enhance your experience. You can control cookies through your browser settings, though disabling them may limit functionality.</p>
            </Section>

            <Section title="9. Your Rights">
              <p>You can manage your communication preferences, request access to your data, request deletion of your account and all associated data, or unsubscribe from any communications at any time. Contact us at support@ambitt.agency for any data requests.</p>
            </Section>

            <Section title="10. Children&apos;s Privacy">
              <p>Our services are not directed at individuals under the age of 18. If we discover that we have collected personal information from a minor, we will take steps to remove that information promptly.</p>
            </Section>

            <Section title="11. Changes to This Policy">
              <p>We may update this privacy policy from time to time. Changes will be posted on this page. Continued use of our services after changes constitutes acceptance of the updated policy.</p>
            </Section>

            <Section title="12. Contact">
              <p>Questions about this privacy policy? Contact us at <a href="mailto:support@ambitt.agency" className="text-accent hover:underline">support@ambitt.agency</a>, or write to Kufgroup LLC (d/b/a Ambitt Agents).</p>
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
