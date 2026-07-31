import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

/* ---------------------------------------------------------------------------
   Public evidence of how clients opt in to text messages.

   Exists because carrier verification (toll-free, and A2P 10DLC) requires
   opt-in documentation "hosted at an external URL", and ours is collected
   inside an authenticated portal a reviewer cannot reach. Unverifiable opt-in
   is the most common toll-free rejection, so this page is the substitute: the
   real consent screen, the exact wording, and what we do and do not do with a
   number.

   Everything on it must stay true to what the portal actually does. If the
   consent copy in client-portal changes, this page and the screenshot change
   with it — a mismatch between the two is precisely what gets a campaign
   rejected, and worse, it would make our published claims false.
   --------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "SMS opt-in — Ambitt Agents",
  description:
    "How Ambitt Agents clients opt in to receive login-verification text messages, including the exact consent wording, message samples, and how to stop.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground font-semibold text-xl mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SmsOptInPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      <section className="relative pt-16 pb-28 px-6">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="label-pill mb-6">Messaging</div>
          <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">SMS opt-in</h1>
          <p className="text-muted-foreground text-sm mb-8">Last updated July 31, 2026</p>

          <p className="text-sm leading-relaxed text-muted-foreground mb-16 max-w-2xl">
            Ambitt Agents is a service of{" "}
            <span className="text-foreground/90">Kufgroup LLC</span> (d/b/a Ambitt Agents). This
            page shows exactly how our clients consent to receive text messages from us, what those
            messages are, and how to stop them.
          </p>

          <div className="space-y-12 text-sm leading-relaxed text-muted-foreground">
            <Section title="What the messages are">
              <p>
                Ambitt Agents provides AI assistants that carry out business tasks for
                small-business clients. When an assistant signs in to a business tool on a
                client&apos;s behalf and that tool sends a one-time verification code, we text the
                client to ask for the code so the sign-in can complete.
              </p>
              <p className="text-foreground/90">
                These are transactional messages to the account holder only. We send no marketing
                or promotional messages to this number, ever.
              </p>
            </Section>

            <Section title="Where consent is collected">
              <p>
                Consent is collected inside the client&apos;s own password-protected portal at{" "}
                <span className="text-foreground/90">portal.ambitt.agency</span>, on the Email setup
                page. Only the account holder can reach it, after signing in with their own
                credentials. We do not buy, rent, or import phone numbers, and numbers are not
                collected anywhere else.
              </p>
              <p>
                Because the page sits behind a login, the screen itself is reproduced below.
              </p>
              <figure className="mt-6 rounded-xl overflow-hidden border border-foreground/10">
                {/* Plain <img>: this page is public evidence and must render for a
                    reviewer even with JS disabled. */}
                <img
                  src="/compliance/sms-opt-in-screen.png"
                  alt="The Ambitt Agents client portal Email setup page, showing the mobile number field and the unchecked SMS consent checkbox with its full disclosure text."
                  width={1420}
                  height={1250}
                  className="w-full h-auto block"
                />
              </figure>
              <figcaption className="text-xs mt-3">
                The consent screen as a client sees it. The checkbox is never pre-checked.
              </figcaption>
            </Section>

            <Section title="The exact consent wording">
              <p>
                The client enters their mobile number and ticks a checkbox that is never
                pre-selected, reading:
              </p>
              <blockquote className="border-l-2 border-foreground/20 pl-4 text-foreground/90">
                &ldquo;I agree to receive login-verification texts from Ambitt Agents at this
                number. Message frequency varies, and message and data rates may apply. Reply STOP
                to opt out or HELP for help.&rdquo;
              </blockquote>
              <p>
                The consent and its timestamp are recorded against the client&apos;s account at the
                moment the box is ticked.
              </p>
            </Section>

            <Section title="Sample messages">
              <p>Every message identifies the sender and carries opt-out instructions.</p>
              <blockquote className="border-l-2 border-foreground/20 pl-4 text-foreground/90 space-y-3">
                <p>
                  &ldquo;Arthur here. CoStar just sent you a verification code. Text back just the
                  code and I&apos;ll finish signing in. Reply STOP to opt out, HELP for help.&rdquo;
                </p>
                <p>
                  &ldquo;Ambitt Agents: your assistant Arthur is paused and will not send anything
                  until you resume him. Reply STOP to opt out, HELP for help.&rdquo;
                </p>
              </blockquote>
            </Section>

            <Section title="How to stop">
              <p>
                Reply <span className="text-foreground/90">STOP</span> to any message and we stop
                texting immediately; the assistant reverts to asking by email. Reply{" "}
                <span className="text-foreground/90">HELP</span> for support details. A client can
                also remove the number from the portal at any time.
              </p>
              <p>Message frequency varies. Message and data rates may apply.</p>
            </Section>

            <Section title="What we do not do with the number">
              <p className="text-foreground/90">
                No mobile information is ever shared with third parties or affiliates for marketing
                or promotional purposes. We do not sell, rent, or share the mobile phone numbers or
                SMS opt-in data of our clients with anyone. Text-messaging originator opt-in data
                and consent are never shared with any third parties.
              </p>
              <p>
                Full detail is in our{" "}
                <a href="/privacy" className="text-foreground/90 underline underline-offset-2">
                  privacy policy
                </a>{" "}
                and{" "}
                <a href="/terms" className="text-foreground/90 underline underline-offset-2">
                  terms
                </a>
                . Questions:{" "}
                <a
                  href="mailto:support@ambitt.agency"
                  className="text-foreground/90 underline underline-offset-2"
                >
                  support@ambitt.agency
                </a>
                .
              </p>
            </Section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
