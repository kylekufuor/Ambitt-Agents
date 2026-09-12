import type { Metadata } from "next";
import { Nav } from "../../components/nav";
import { Footer } from "../../components/footer";

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
  alternates: { canonical: "/sms-opt-in" },
  title: "SMS opt-in — Ambitt Agents",
  description:
    "How Ambitt Agents clients opt in to receive login-verification text messages, including the exact consent wording, message samples, and how to stop.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="legal-heading">{title}</h2>
      <div className="legal-paragraphs">{children}</div>
    </div>
  );
}

export default function SmsOptInPage() {
  return (
    <>
      <Nav />

      <main id="main" className="legal-page"><section className="legal-document">
        <div className="legal-content">
          <div className="kicker">Messaging</div>
          <h1 className="h1">SMS opt-in</h1>
          <p className="legal-date">Last updated July 31, 2026</p>

          <p className="legal-intro">
            Ambitt Agents is a service of{" "}
            <span>Kufgroup LLC</span> (d/b/a Ambitt Agents). This
            page shows exactly how our clients consent to receive text messages from us, what those
            messages are, and how to stop them.
          </p>

          <div className="legal-sections">
            <Section title="What the messages are">
              <p>
                Ambitt Agents provides AI assistants that carry out business tasks for
                small-business clients. When an assistant signs in to a business tool on a
                client&apos;s behalf and that tool sends a one-time verification code, we text the
                client to ask for the code so the sign-in can complete.
              </p>
              <p>
                These are transactional messages to the account holder only. We send no marketing
                or promotional messages to this number, ever.
              </p>
            </Section>

            <Section title="Where consent is collected">
              <p>
                Consent is collected inside the client&apos;s own password-protected portal at{" "}
                <span>portal.ambitt.agency</span>, on the Email setup
                page. Only the account holder can reach it, after signing in with their own
                credentials. We do not buy, rent, or import phone numbers, and numbers are not
                collected anywhere else.
              </p>
              <p>
                Because the page sits behind a login, the consent card itself is reproduced below,
                exactly as it appears to a client who has just arrived.
              </p>
              <p>
                The checkbox is empty. It is not pre-selected, not pre-filled, and not checked by
                default. A client has to type their number and tick the box themselves before the
                Save button will do anything.
              </p>
              <figure>
                {/* Plain <img>: this page is public evidence and must render for a
                    reviewer even with JS disabled.

                    The filename is versioned by state rather than reused. The
                    first submission was rejected as "Opt-In Checkbox is
                    Pre-selected" because the screenshot at the old path had been
                    taken mid-test with the box ticked. Pointing a resubmission at
                    the same URL risks a reviewer being served the cached copy of
                    exactly the image that got us rejected. */}
                <img
                  src="/compliance/sms-opt-in-consent-unchecked.png"
                  alt="The consent card in the Ambitt Agents client portal: an empty mobile number field, and an UNCHECKED consent checkbox reading 'I agree to receive login-verification texts from Ambitt Agents at this number. Message frequency varies, and message and data rates may apply. Reply STOP to opt out or HELP for help.'"
                  width={1800}
                  height={718}

                />
              </figure>
              <figcaption>
                The consent card in its default state, captured directly from the running portal.
                The checkbox is unchecked until the client ticks it.
              </figcaption>
            </Section>

            <Section title="The exact consent wording">
              <p>
                The client enters their mobile number and ticks a checkbox that is never
                pre-selected, reading:
              </p>
              <blockquote>
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
              <blockquote>
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
                Reply <span>STOP</span> to any message and we stop
                texting immediately; the assistant reverts to asking by email. Reply{" "}
                <span>HELP</span> for support details. A client can
                also remove the number from the portal at any time.
              </p>
              <p>Message frequency varies. Message and data rates may apply.</p>
            </Section>

            <Section title="What we do not do with the number">
              <p>
                No mobile information is ever shared with third parties or affiliates for marketing
                or promotional purposes. We do not sell, rent, or share the mobile phone numbers or
                SMS opt-in data of our clients with anyone. Text-messaging originator opt-in data
                and consent are never shared with any third parties.
              </p>
              <p>
                Full detail is in our{" "}
                <a href="/privacy">
                  privacy policy
                </a>{" "}
                and{" "}
                <a href="/terms">
                  terms
                </a>
                . Questions:{" "}
                <a
                  href="mailto:support@ambitt.agency"

                >
                  support@ambitt.agency
                </a>
                .
              </p>
            </Section>
          </div>
        </div>
      </section></main>

      <Footer />
    </>
  );
}
