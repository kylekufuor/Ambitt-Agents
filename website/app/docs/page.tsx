import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

/* ---------------------------------------------------------------------------
   The public documentation.

   Public on purpose, even though every reader has an account. Two of the most
   likely moments of confusion happen when somebody CANNOT get into the portal:
   the first sign-in, and a forgotten password. Help that lives only behind the
   login is missing exactly when it is needed most, so the canonical copy sits
   out here and the portal's own help page links in.

   Written as answers to what someone is trying to do, not as a tour of
   features. Every claim has to stay true to the product: documentation that
   has drifted is worse than none, because it spends trust the product is
   otherwise earning. Section ids are linked to from inside the portal, so
   renaming one breaks a link a client is following.
   --------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Documentation — Ambitt Agents",
  description:
    "How to work with your Ambitt agent: asking for work, approvals, leads, stopping and starting, login codes, tools and billing.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      <h2 className="text-foreground font-semibold text-xl mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="text-foreground/90 font-medium text-[15px] mb-1.5">{q}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const CONTENTS: { id: string; label: string }[] = [
  { id: "signing-in", label: "Signing in" },
  { id: "asking", label: "Asking for work" },
  { id: "approvals", label: "Approvals" },
  { id: "leads", label: "Your leads" },
  { id: "control", label: "Stopping and starting" },
  { id: "codes", label: "Login codes by text" },
  { id: "tools", label: "Tools and passwords" },
  { id: "billing", label: "Billing and cancelling" },
  { id: "help", label: "Getting a person" },
];

export default function DocsPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      <section className="relative pt-16 pb-28 px-6">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="label-pill mb-6">Documentation</div>
          <h1 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">How this works</h1>

          <p className="text-sm leading-relaxed text-muted-foreground mb-10 max-w-2xl">
            Your agent works for you by email. There is no software to learn and nothing to
            configure before it starts. This page covers the handful of things people ask, in the
            order they tend to come up.
          </p>

          <nav aria-label="Contents" className="mb-16 rounded-xl border border-foreground/10 p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
            {/* Flows DOWN the first column and then across, not across-then-down.
                A two-column grid filling by rows puts items 1,3,5,7,9 in the left
                column, so reading it top to bottom silently skips half the page. */}
            <ul className="grid sm:grid-flow-col sm:grid-rows-5 gap-x-6 gap-y-1.5 text-sm">
              {CONTENTS.map((c) => (
                <li key={c.id}>
                  <a href={`#${c.id}`} className="text-foreground/90 hover:underline underline-offset-2">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-14 text-sm leading-relaxed text-muted-foreground">
            <Section id="signing-in" title="Signing in">
              <Q q="Your first time">
                <p>
                  Go to{" "}
                  <a
                    href="https://portal.ambitt.agency"
                    className="text-foreground/90 underline underline-offset-2"
                  >
                    portal.ambitt.agency
                  </a>
                  , put in your email, and choose{" "}
                  <span className="text-foreground/90">Email me a link to set my password</span>. We
                  send you a link, you pick a password, and you are in. Nobody here can see it.
                </p>
                <p>
                  The only rule is eight characters or more. A long ordinary phrase beats a short
                  complicated one, so use whatever you will actually remember.
                </p>
              </Q>
              <Q q="Staying signed in">
                <p>
                  Leave <span className="text-foreground/90">Remember this device</span> ticked and
                  you stay signed in for ninety days. On a shared computer, untick it and we sign
                  you out when the browser closes.
                </p>
              </Q>
              <Q q="Forgotten it">
                <p>
                  Same button. Setting a password for the first time and resetting one are the same
                  thing, so there is nothing different to find.
                </p>
              </Q>
            </Section>

            <Section id="asking" title="Asking for work">
              <Q q="How to ask">
                <p>
                  Reply to any email your agent sends, or write to their address directly. It is on
                  the Email setup page in your portal. Write it the way you would write to a
                  colleague. There is no format, and no commands to learn.
                </p>
                <p>
                  They will confirm what they understood before doing anything substantial, so if
                  they have taken it the wrong way you will see that in the reply rather than in the
                  result.
                </p>
              </Q>
              <Q q="Sending a file">
                <p>
                  Email it with <span className="text-foreground/90">DOCS</span> in the subject line.
                  That marks the attachment as reference material to work from rather than a one off
                  question, and they will keep using it.
                </p>
              </Q>
              <Q q="When they work">
                <p>
                  On a schedule you set, and whenever you write to them. The schedule is on the
                  &ldquo;How he works&rdquo; page in your portal, in your own time zone. Changing it
                  is a message away.
                </p>
              </Q>
            </Section>

            <Section id="approvals" title="Approvals">
              <Q q="What they are">
                <p>
                  Anything your agent has stopped for rather than decided alone. On a supervised
                  setup, that is everything that would leave in your name.
                </p>
              </Q>
              <Q q="Answering one">
                <p>
                  Each approval has three replies ready to go: yes, change something first, or leave
                  it. They open an email with the wording already filled in, and you can edit it
                  before sending. A one word answer is fine.
                </p>
                <p>
                  Nothing happens until you answer. There is no timer and nothing goes ahead by
                  default.
                </p>
              </Q>
            </Section>

            <Section id="leads" title="Your leads">
              <Q q="Hot, warm and cold">
                <p>
                  Your agent&rsquo;s read on how close somebody is, and they have to give a reason
                  for each one rather than just a label. Where they have not judged a lead yet, it
                  sits by how far the outreach has got instead, and says so.
                </p>
                <p>
                  If you move a lead yourself, your call stands. They will not quietly move it back.
                </p>
              </Q>
              <Q q="Correcting something">
                <p>
                  Open the lead and use <span className="text-foreground/90">Anything he got wrong</span>.
                  That is a message to your agent rather than an edit to a database: they read it,
                  confirm, and handle similar ones the same way from then on.
                </p>
              </Q>
              <Q q="Taking them with you">
                <p>
                  Export from Settings, whenever you like, without asking us first. Everything your
                  agent finds is yours.
                </p>
              </Q>
            </Section>

            <Section id="control" title="Stopping and starting">
              <Q q="Stopping">
                <p>
                  One button on the &ldquo;How he works&rdquo; page, and it takes effect
                  immediately. Nothing goes out in your name while your agent is stopped, and
                  nothing is lost. They pick up where they left off when you start them again.
                </p>
              </Q>
              <Q q="When we have stopped them">
                <p>
                  Occasionally we pause an agent ourselves, or an automatic safety limit does. You
                  will see that on the same page, and it is ours to lift rather than yours, so
                  there is no button that would fail if you pressed it. Write to us and we will
                  explain and sort it.
                </p>
              </Q>
            </Section>

            <Section id="codes" title="Login codes by text">
              <Q q="Why we ask for a mobile number">
                <p>
                  When your agent signs in to a site on your behalf and it sends a one time
                  verification code, they need it within about a minute or the login expires. Email
                  is usually too slow for that, so we text you and you text the code back.
                </p>
              </Q>
              <Q q="What we do with the number">
                <p>
                  Only that. We never send marketing to it, we never share or sell it, and it is
                  not used for anything else. Reply <span className="text-foreground/90">STOP</span>{" "}
                  at any time and we stop texting immediately, and your agent goes back to asking by
                  email. You can also remove the number from the portal.
                </p>
                <p>
                  Message frequency varies, and message and data rates may apply. The full detail is
                  in our{" "}
                  <a href="/sms-opt-in" className="text-foreground/90 underline underline-offset-2">
                    SMS opt-in page
                  </a>{" "}
                  and our{" "}
                  <a href="/privacy" className="text-foreground/90 underline underline-offset-2">
                    privacy policy
                  </a>
                  .
                </p>
              </Q>
            </Section>

            <Section id="tools" title="Tools and passwords">
              <Q q="What the Tools page shows">
                <p>
                  The accounts your agent uses on your behalf, and which ones still need you.
                  Anything marked as needing setup is a tool they cannot use yet.
                </p>
              </Q>
              <Q q="Where passwords are kept">
                <p>
                  In an encrypted vault. We never see the values ourselves, and your agent uses them
                  to sign in without them being readable by us or stored in plain text anywhere.
                </p>
              </Q>
            </Section>

            <Section id="billing" title="Billing and cancelling">
              <Q q="Invoices and cards">
                <p>
                  Under Billing in your portal. Your card and your receipts are held by Stripe
                  rather than by us, so we never see or store a card number.
                </p>
              </Q>
              <Q q="What counts against your plan">
                <p>
                  Conversations with your agent. Onboarding emails, and anything your agent sends
                  you about their own setup, do not count. They stop at your plan limit rather than
                  running up a bill you did not agree to.
                </p>
              </Q>
              <Q q="Cancelling">
                <p>
                  Tell us and we will do it and confirm. It is a message to a person, not a hidden
                  setting, and there is no retention call.
                </p>
              </Q>
            </Section>

            <Section id="help" title="Getting a person">
              <p>
                Write to{" "}
                <a
                  href="mailto:support@ambitt.agency"
                  className="text-foreground/90 underline underline-offset-2"
                >
                  support@ambitt.agency
                </a>{" "}
                and a person reads it. Say what you were trying to do and what happened instead, and
                that is enough to start.
              </p>
              <p>
                You can also just reply to your agent. Anything meant for us rather than for them
                gets passed on.
              </p>
            </Section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
