import { pageMetadata } from "../_components/metadata";
import { Btn, Kicker } from "../_components/primitives";
import { Nav } from "../../components/nav";
import { Footer } from "../../components/footer";
import { DocsSidebar } from "./docs-nav";
import { DOC_SECTIONS } from "./sections";

/* ---------------------------------------------------------------------------
   The public documentation.

   Public on purpose, even though every reader has an account. Two of the
   likeliest moments of confusion happen when somebody CANNOT get into the
   portal: the first sign-in, and a forgotten password. Help that lives only
   behind the login is missing exactly when it is needed most, so the canonical
   copy sits out here and the portal's own help page links in.

   The grouped sidebar tracks the section being read. On a phone, the same
   section list becomes a compact jump menu above the guide.

   Written as answers to what someone is trying to do, not as a tour of
   features. Every claim has to stay true to the product: documentation that has
   drifted is worse than none, because it spends trust the product is otherwise
   earning.
   --------------------------------------------------------------------------- */

export const metadata = pageMetadata({ path: "/docs", title: "The portal guide: Ambitt Agents", description: "Your guide to the Ambitt workspace: browser tools, agent chat, watching, Playbook, files, leads and billing." });

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

  return <><Nav page="docs" /><main id="main" className="support-page docs-page">
      <section className="support-hero wrap">
        <Kicker>The portal guide</Kicker>
        <h1 className="h1">Your workspace.<br /><span className="accent">A little guidance.</span></h1>
        <p className="dek">Follow the work, review a decision, or give your agent a new brief. Here is where to find each part.</p>
        <div className="support-actions"><Btn href="https://portal.ambitt.agency" icon="arrow-up-right">Open portal</Btn><Btn href="/use-cases" kind="ghost">Watch a workflow</Btn></div>
      </section>
      <div className="docs-grid">
        <DocsSidebar />
        <div className="docs-body">
          <details className="docs-jump"><summary>Jump to a section</summary><ul>{DOC_SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>)}</ul></details>
          <Section id="workspace" title="A look around your workspace" lede={lede["workspace"]}>
            <figure className="docs-screenshot"><img src="/demos/portal-workspace-dark.webp" width="1440" height="1030" alt="The Ambitt browser workspace with agent chat and proposed instructions in a fictional sample scenario" /><figcaption>The current portal, with fictional sample data.</figcaption></figure>
            <Q q="Start at Home"><p>Home is your browser workspace. Choose Add a tool to add a website, connect an app, or import a file. Open a web tool from the sidebar; chat with your agent alongside it. Work overview opens the weekly summary of leads, emails and decisions.</p></Q>
            <Q q="Follow the work"><p>Open Leads for the board or table. Approvals collects the decisions waiting for your reply. Activity lets you look through the work log.</p></Q>
            <Q q="Find the controls"><p>Learn together helps your agent understand your process. Do a task asks your active agent to carry out work through its connected tools. Playbook holds instructions you have confirmed. Files holds imports and generated attachments; Schedule controls when your agent works.</p></Q>
            <Q q="Choose your appearance"><p>Use the Light or Dark control in the top bar. Your preference is saved on this browser. On a phone, open the navigation menu to reach the same pages.</p></Q>
            <Q q="Teach a workflow"><p>Open a web tool, finish signing in, then choose Start watching and approve the current website. The green indicator shows when your agent is watching. It saves visible-page learning notes and selected controls, asks questions, and proposes instructions. Confirm an instruction before it becomes part of the Playbook.</p><p>Stop watching whenever you like. Hiding the portal tab or changing websites stops watching; a different website needs fresh consent. Password pages, form values and editable content are excluded. Activity shows the watch log.</p></Q><Note><p>Watching saves learning notes, not a video. The browser runs in the cloud; some websites need a separate desktop setup. Credit top-ups and self-serve plans remain in development. Screenshots and videos use fictional data.</p></Note>
          </Section>

          <Section id="signing-in" title="Signing in" lede={lede["signing-in"]}>
            <Q q="Your first time">
              <p>
                Go to{" "}
                <a href="https://portal.ambitt.agency" className="text-link">
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
                Use Chat in the portal and select Do a task, reply to an email your agent sends, or write to their address directly. It is on
                the Email setup page in your portal. Write it the way you would write to a
                colleague: there is no format, and no commands to learn.
              </p>
              <p>
                Include the goal, the relevant context, and anything they should leave alone. Clear boundaries help your agent make useful decisions.
              </p>
            </Q>
            <Q q="Sending a file">
              <p>
                Import Excel, CSV, PDF, Word, text or JSON files up to 5 MB through Add a tool or Files. Select a file when asking your agent about it. For ongoing email reference material, email it with <strong>DOCS</strong> in the subject line. That marks the attachment as
                reference material to work from rather than a one off question, and they keep using
                it.
              </p>
            </Q>
            <Q q="When they work">
              <p>
                On a schedule you set, and whenever you write to them. The schedule and time zone are on the Schedule page in your portal.
                Update the schedule there whenever you need to.
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
                Read the reason alongside the rating. If it needs correcting, email your agent with the lead name and what should change.
              </p>
            </Q>
            <Q q="Correcting something">
              <p>
                Reply to your agent with the lead name, the incorrect detail, and the correction. The lead record helps you find the context to include.
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
                Use Pause agent on the How they work page. Check the updated status before leaving. You can resume an agent you paused; an operator or safety hold needs our team to review it.
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
                <a href="/sms-opt-in" className="text-link">
                  SMS opt-in page
                </a>{" "}
                shows the exact consent screen and wording, and the{" "}
                <a href="/privacy" className="text-link">
                  privacy policy
                </a>{" "}
                covers the rest.
              </p>
            </Q>
          </Section>

          <Section id="tools" title="Tools and passwords" lede={lede["tools"]}>
            <Q q="What the Tools page shows">
              <p>
                Choose Add a tool to search the app catalogue and complete the provider’s connection flow. Connected accounts shows the accounts your agent uses on your behalf and which ones still need you. Anything
                marked as needing setup is a tool they cannot use yet.
              </p>
            </Q>
            <Q q="Where passwords are kept">
              <p>
                Credentials are encrypted at rest. Use the connection flow provided for each tool, and avoid sending passwords in ordinary email or support messages.
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
                Your current Billing page shows the allowance and extra interaction rate for your account. Setup and onboarding messages do not count toward the monthly allowance. The upcoming credit plans shown on the pricing page have not replaced existing account billing. Watching time is shown for your records; no separate watching charge is enabled.
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
                <a href="mailto:support@ambitt.agency" className="text-link">
                  support@ambitt.agency
                </a>{" "}
                reaches a human. Say what you were trying to do and what happened instead. That is
                enough to start.
              </p>
              <p>
                For account or billing help, use the support address. For a work request or a correction to a brief, reply to your agent.
              </p>
            </Q>
          </Section>
        </div>

      </div>

    </main><Footer /></>;
}
