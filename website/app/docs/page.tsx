import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";
import { DocsSidebar, DocsOnThisPage } from "./docs-nav";
import { DOC_GROUPS, DOC_SECTIONS } from "./sections";

/* ---------------------------------------------------------------------------
   The public documentation.

   Public on purpose, even though every reader has an account. Two of the
   likeliest moments of confusion happen when somebody CANNOT get into the
   portal: the first sign-in, and a forgotten password. Help that lives only
   behind the login is missing exactly when it is needed most, so the canonical
   copy sits out here and the portal's own help page links in.

   Layout is Databricks' docs structure — grouped sidebar, content, on-this-page
   rail, hairline-separated sections, one tinted callout — in our own tokens,
   which is the same trade the rest of the design system already makes: their
   structure, our teal. The hero borrows its shape from Lev: an eyebrow, a
   display line with real size, and a lede, left-aligned rather than centred.

   Written as answers to what someone is trying to do, not as a tour of
   features. Every claim has to stay true to the product: documentation that has
   drifted is worse than none, because it spends trust the product is otherwise
   earning.
   --------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Documentation — Ambitt Agents",
  description:
    "How to work with your Ambitt agent: asking for work, approvals, leads, stopping and starting, login codes, tools and billing.",
};

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="docs-sec">
      <h2>
        {title}
        <a className="docs-anchor" href={`#${id}`} aria-label={`Link to ${title}`}>
          #
        </a>
      </h2>
      <p className="docs-sec-lede">{lede}</p>
      {children}
    </section>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="docs-q">
      <h3>{q}</h3>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="docs-note">{children}</div>;
}

export default function DocsPage() {
  const lede = DOC_SECTIONS.reduce<Record<string, string>>((acc, s) => {
    acc[s.id] = s.blurb;
    return acc;
  }, {});

  return (
    // NOT overflow-x-hidden, which every other page on the site uses.
    //
    // overflow-x: hidden forces overflow-y to compute as auto, which makes this
    // element a scroll container — and position: sticky then anchors to it
    // rather than to the viewport. Since main is as tall as its content, the
    // rails never stick: they scroll away with the page, taking the current
    // section highlight with them. The docs page has no full-bleed decoration
    // to contain, so it simply does without.
    <main>
      <Nav />

      {/* Hero sits full width above the grid, so the display line gets the whole
          measure rather than being boxed into the content column. */}
      <section className="pt-14 pb-10">
        <div className="docs-grid">
          <div className="lg:col-start-2">
            <p className="eyebrow mb-4">
              <span className="tick" aria-hidden />
              Documentation
            </p>
            <h1
              className="disp"
              style={{
                fontSize: "clamp(38px, 5.2vw, 58px)",
                fontWeight: 500,
                lineHeight: 1.08,
                letterSpacing: "-0.018em",
                color: "var(--ink-max)",
                maxWidth: "16ch",
              }}
            >
              Everything your agent can do, and how to ask.
            </h1>
            <p
              style={{
                marginTop: 18,
                fontSize: 17,
                lineHeight: 1.6,
                color: "var(--muted)",
                maxWidth: "58ch",
              }}
            >
              Your agent works for you by email. There is nothing to install and nothing to
              configure before they start. This covers the handful of things people actually ask,
              in the order they tend to come up.
            </p>
          </div>
        </div>
      </section>

      <div className="docs-grid pb-28">
        <DocsSidebar />

        <div className="docs-body">
          <details className="docs-jump">
            <summary>Jump to a section</summary>
            <ul>
              {DOC_SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ul>
          </details>

          <Section id="signing-in" title="Signing in" lede={lede["signing-in"]}>
            <Q q="Your first time">
              <p>
                Go to{" "}
                <a href="https://portal.ambitt.agency" style={{ color: "var(--link)" }}>
                  portal.ambitt.agency
                </a>
                , put in your email, and choose <strong>Email me a link to set my password</strong>.
                We send you a link, you pick a password, and you are in.
              </p>
              <p>
                The only rule is eight characters or more. A long ordinary phrase beats a short
                complicated one, so use whatever you will actually remember.
              </p>
            </Q>
            <Note>
              <p>
                Nobody here can see your password, including us. Sign in is handled by our login
                provider, so we never receive it and have nothing to store.
              </p>
            </Note>
            <Q q="Staying signed in">
              <p>
                Leave <strong>Remember this device</strong> ticked and you stay signed in for ninety
                days. On a shared computer, untick it and we sign you out when the browser closes.
              </p>
            </Q>
            <Q q="Forgotten it">
              <p>
                The same button. Setting a password for the first time and resetting one are the
                same thing here, so there is nothing different to hunt for.
              </p>
            </Q>
          </Section>

          <Section id="asking" title="Asking for work" lede={lede["asking"]}>
            <Q q="How to ask">
              <p>
                Reply to any email your agent sends, or write to their address directly. It is on
                the Email setup page in your portal. Write it the way you would write to a
                colleague: there is no format, and no commands to learn.
              </p>
              <p>
                They confirm what they understood before doing anything substantial, so if they have
                taken it the wrong way you see that in the reply rather than in the result.
              </p>
            </Q>
            <Q q="Sending a file">
              <p>
                Email it with <strong>DOCS</strong> in the subject line. That marks the attachment as
                reference material to work from rather than a one off question, and they keep using
                it.
              </p>
            </Q>
            <Q q="When they work">
              <p>
                On a schedule you set, and whenever you write to them. The schedule is on the
                &ldquo;How he works&rdquo; page in your portal, shown in your own time zone.
                Changing it is a message away.
              </p>
            </Q>
          </Section>

          <Section id="approvals" title="Approvals" lede={lede["approvals"]}>
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
            </Q>
            <Note>
              <p>
                Nothing happens until you answer. There is no timer, and nothing goes ahead by
                default because you were busy.
              </p>
            </Note>
          </Section>

          <Section id="leads" title="Your leads" lede={lede["leads"]}>
            <Q q="Hot, warm and cold">
              <p>
                Your agent&rsquo;s read on how close somebody is, and they have to give a reason for
                each one rather than just a label. Where they have not judged a lead yet, it sits by
                how far the outreach has got instead, and says so.
              </p>
              <p>
                If you move a lead yourself, your call stands. They will not quietly move it back.
              </p>
            </Q>
            <Q q="Correcting something">
              <p>
                Open the lead and use <strong>Anything he got wrong</strong>. That is a message to
                your agent rather than an edit to a database: they read it, confirm, and handle
                similar ones the same way from then on.
              </p>
            </Q>
            <Q q="Taking them with you">
              <p>
                Export from Settings, whenever you like, without asking us first. Everything your
                agent finds is yours.
              </p>
            </Q>
          </Section>

          <Section id="control" title="Stopping and starting" lede={lede["control"]}>
            <Q q="Stopping">
              <p>
                One button on the &ldquo;How he works&rdquo; page, and it takes effect immediately.
                Nothing goes out in your name while your agent is stopped, and nothing is lost: they
                pick up where they left off when you start them again.
              </p>
            </Q>
            <Q q="When we have stopped them">
              <p>
                Occasionally we pause an agent ourselves, or an automatic safety limit does. You
                will see that on the same page. It is ours to lift rather than yours, so there is no
                button sitting there that would fail if you pressed it. Write to us and we will
                explain and sort it.
              </p>
            </Q>
          </Section>

          <Section id="codes" title="Login codes by text" lede={lede["codes"]}>
            <Q q="Why we ask for a mobile number">
              <p>
                When your agent signs in to a site on your behalf and it sends a one time
                verification code, they need it within about a minute or the login expires. Email is
                usually too slow, so we text you and you text the code back.
              </p>
            </Q>
            <Note>
              <p>
                That number is used for login codes and nothing else. We never send marketing to it,
                and we never share or sell it.
              </p>
              <p>
                Reply <strong>STOP</strong> to any message and we stop immediately, and your agent
                goes back to asking by email. You can also remove the number in the portal. Message
                frequency varies, and message and data rates may apply.
              </p>
            </Note>
            <Q q="Where the detail is">
              <p>
                Our{" "}
                <a href="/sms-opt-in" style={{ color: "var(--link)" }}>
                  SMS opt-in page
                </a>{" "}
                shows the exact consent screen and wording, and the{" "}
                <a href="/privacy" style={{ color: "var(--link)" }}>
                  privacy policy
                </a>{" "}
                covers the rest.
              </p>
            </Q>
          </Section>

          <Section id="tools" title="Tools and passwords" lede={lede["tools"]}>
            <Q q="What the Tools page shows">
              <p>
                The accounts your agent uses on your behalf, and which ones still need you. Anything
                marked as needing setup is a tool they cannot use yet.
              </p>
            </Q>
            <Q q="Where passwords are kept">
              <p>
                In an encrypted vault. We never see the values ourselves, and your agent signs in
                with them without them being readable by us or stored in plain text anywhere.
              </p>
            </Q>
          </Section>

          <Section id="billing" title="Billing and cancelling" lede={lede["billing"]}>
            <Q q="Invoices and cards">
              <p>
                Under Billing in your portal. Your card and your receipts are held by Stripe rather
                than by us, so we never see or store a card number.
              </p>
            </Q>
            <Q q="What counts against your plan">
              <p>
                Conversations with your agent. Onboarding emails, and anything your agent sends you
                about their own setup, do not count. They stop at your plan limit rather than
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

          <Section id="help" title="Getting a person" lede={lede["help"]}>
            <Q q="Write to us">
              <p>
                <a href="mailto:support@ambitt.agency" style={{ color: "var(--link)" }}>
                  support@ambitt.agency
                </a>{" "}
                reaches a human. Say what you were trying to do and what happened instead. That is
                enough to start.
              </p>
              <p>
                You can also just reply to your agent. Anything meant for us rather than for them
                gets passed on.
              </p>
            </Q>
          </Section>
        </div>

        <DocsOnThisPage />
      </div>

      <Footer />
    </main>
  );
}
