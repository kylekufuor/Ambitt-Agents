import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Terms of Service — Ambitt Agents",
  description: "The terms that govern your use of Ambitt Agents, including our SMS messaging terms.",
};

export default function TermsPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      <section className="relative pt-16 pb-28 px-6">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="label-pill mb-6">Legal</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-muted-foreground text-sm mb-8">Last updated July 23, 2026</p>

          <p className="text-sm leading-relaxed text-muted-foreground mb-16 max-w-2xl">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Ambitt Agents, a service of{" "}
            <span className="text-foreground/90">Kufgroup LLC</span>{" "}(d/b/a Ambitt Agents), operating at ambitt.agency.
            By creating an account or using the service, you agree to these Terms. When we say
            &ldquo;we&rdquo; or &ldquo;our team,&rdquo; we mean Kufgroup LLC.
          </p>

          <div className="space-y-12 text-sm leading-relaxed text-muted-foreground">
            <Section title="1. The Service">
              <p>Ambitt Agents provides managed AI agents that do work on your behalf — they use the tools you connect, deliver results by email, and, when you opt in, send you text messages tied to that work. You give an agent access to your accounts and data so it can act for you, and you stay in control of what it can touch.</p>
            </Section>

            <Section title="2. Your Account">
              <p>You&apos;re responsible for the accuracy of the information you provide and for keeping your login credentials secure. You must be at least 18 years old and authorized to bind your business to these Terms. Everything your agent does under your account is your responsibility, so connect only accounts you&apos;re allowed to use.</p>
            </Section>

            <Section title="3. Subscriptions & Billing">
              <p>Ambitt Agents is offered on a subscription basis, billed in advance through our payment processor (Stripe). Setup fees, where they apply, are billed once at the start. Subscriptions renew automatically until you cancel. You can cancel anytime; your agent stays active through the end of the current billing period, and we don&apos;t provide prorated refunds for partial periods unless required by law.</p>
            </Section>

            <Section title="4. Acceptable Use">
              <p>Don&apos;t use the service to break the law, infringe someone&apos;s rights, send spam, or access systems you&apos;re not authorized to access. Don&apos;t attempt to disrupt or reverse-engineer the platform. We may suspend an agent that we reasonably believe is being used in a harmful or abusive way.</p>
            </Section>

            <Section title="5. Messaging Terms (SMS)">
              <p>If you provide your mobile number and opt in, we&apos;ll send you transactional text messages from Ambitt Agents. Here&apos;s what to expect:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-3 text-muted-foreground/80">
                <li><span className="text-foreground/80 font-medium">Message types:</span> account notifications and login-verification (2FA) requests related to work you&apos;ve asked your agent to do. We never send marketing or promotional texts.</li>
                <li><span className="text-foreground/80 font-medium">Frequency:</span> message frequency varies.</li>
                <li><span className="text-foreground/80 font-medium">Cost:</span> message and data rates may apply. These are charged by your mobile carrier, not by us.</li>
                <li><span className="text-foreground/80 font-medium">Opt out:</span> reply STOP to any message to stop receiving texts. Reply HELP for help, or email support@ambitt.agency.</li>
                <li><span className="text-foreground/80 font-medium">Not a condition of purchase:</span> your consent to receive text messages is not a condition of buying any product or service from us.</li>
              </ul>
              <p className="mt-3">Carriers are not liable for delayed or undelivered messages. We handle your mobile number and SMS consent as described in our{" "}
                <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a> — we never share it with third parties or affiliates for marketing.</p>
            </Section>

            <Section title="6. Client Data & Tool Connections">
              <p>You keep ownership of the data in your connected tools and the content your agent produces for you. You grant us the limited right to access and process that data solely to run the service you&apos;ve asked for. We don&apos;t use your business data to train models or share it with other clients. See our <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a> for the details.</p>
            </Section>

            <Section title="7. Intellectual Property">
              <p>The platform, its software, and its branding belong to us. The work product your agent generates for you is yours to use in your business. You may not copy, resell, or white-label the platform itself without our written permission.</p>
            </Section>

            <Section title="8. Disclaimers">
              <p>We work hard to make agents useful and reliable, but the service is provided &ldquo;as is.&rdquo; AI agents can make mistakes, and you&apos;re responsible for reviewing important outputs before acting on them. We don&apos;t warrant that the service will be uninterrupted or error-free, and we&apos;re not a substitute for professional (legal, financial, or medical) advice.</p>
            </Section>

            <Section title="9. Limitation of Liability">
              <p>To the fullest extent permitted by law, our total liability for any claim arising out of the service is limited to the amount you paid us in the 12 months before the claim. We&apos;re not liable for indirect, incidental, or consequential damages.</p>
            </Section>

            <Section title="10. Termination">
              <p>You can cancel your subscription at any time. We may suspend or terminate your account if you breach these Terms or don&apos;t pay. On termination, your agents stop and your data is handled as described in our Privacy Policy.</p>
            </Section>

            <Section title="11. Changes to These Terms">
              <p>We may update these Terms from time to time. When we do, we&apos;ll post the updated version here and update the date above. Continued use of the service after changes take effect means you accept the updated Terms.</p>
            </Section>

            <Section title="12. Governing Law">
              <p>These Terms are governed by the laws of the United States and the state in which Kufgroup LLC is organized, without regard to conflict-of-laws rules.</p>
            </Section>

            <Section title="13. Contact">
              <p>Questions about these Terms? Contact us at <a href="mailto:support@ambitt.agency" className="text-accent hover:underline">support@ambitt.agency</a>, or write to Kufgroup LLC (d/b/a Ambitt Agents).</p>
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
