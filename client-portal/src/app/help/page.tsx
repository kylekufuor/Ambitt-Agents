import Link from "next/link";
import { V3Shell } from "@/components/v3-shell";
import { PageHead, Panel, Eyebrow } from "@/components/v3-ui";
import { requirePortalContext } from "@/lib/portal-context";

/* ---------------------------------------------------------------------------
   The page you open when you are not sure what to do.

   Organised by what someone is trying to DO, not by what we happened to build.
   Nobody arrives here wanting to read about "the approvals module"; they arrive
   holding a question, usually one of about nine. So every entry is that
   question in the words a client would use, a short answer, and a link to the
   exact place they do it. If an answer needs more than a few lines, that is a
   sign the underlying screen is not clear enough and the fix belongs there.

   Everything on this page has to stay true to what the product actually does.
   A help page that describes an older version is worse than none, because it
   spends the trust the rest of the portal is earning. Where the answer depends
   on their setup, it is read from their own agent rather than written as a
   general claim.
   --------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

/**
 * The full documentation, which lives on the public site rather than in here.
 *
 * Public on purpose: two of the likeliest moments of confusion happen when
 * somebody CANNOT get into the portal — the first sign-in and a forgotten
 * password — and help behind the login is missing exactly then. This page is
 * the short version for people already inside; the canonical copy is there,
 * and each section below points at its part of it.
 */
const DOCS = "https://www.ambitt.agency/docs";

function Answer({
  q,
  children,
  href,
  cta,
}: {
  q: string;
  children: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0 border-b border-[color:var(--border)] last:border-0">
      <h3 className="font-display-sm text-[14.5px] text-[color:var(--text)]">{q}</h3>
      <div className="text-[13px] text-[color:var(--text-2)] mt-1.5 leading-relaxed max-w-[62ch]">
        {children}
      </div>
      {href && cta && (
        <Link
          href={href}
          className="inline-block text-[13px] text-[color:var(--brand-ink)] mt-2 no-underline hover:underline"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

export default async function HelpPage() {
  const { email, client, agent } = await requirePortalContext();
  const name = agent?.name ?? "your agent";
  const supervised = agent?.autonomyLevel !== "autonomous";

  return (
    <V3Shell user={{ email, name: client.businessName }} crumbs={[{ label: "Help" }]}>
      <PageHead
        title="How this works"
        sub={`The short answers, and where to go for each. If none of it fits, write to us and a person will read it.`}
      />

      {/* Asymmetric on purpose: the questions carry the page, and the "ask a
          human" column stays visible beside them rather than being buried at
          the bottom where people look last. */}
      <div className="grid gap-3.5 lg:grid-cols-[1.65fr_1fr] items-start">
        <div className="grid gap-3.5">
          <Panel>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <Eyebrow>Full documentation</Eyebrow>
                <p className="text-[13px] text-[color:var(--text-2)] mt-2 leading-relaxed max-w-[52ch]">
                  The long version lives on our site, so it is there even when you cannot get in
                  here. Everything below links into it.
                </p>
              </div>
              <a
                className="btn btn-secondary btn-sm no-underline shrink-0"
                href={DOCS}
                target="_blank"
                rel="noreferrer"
              >
                Read the docs
              </a>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Telling {name} what to do</Eyebrow>
              <a
                className="text-[12px] text-[color:var(--text-3)] no-underline hover:text-[color:var(--brand-ink)] hover:underline shrink-0"
                href={`${DOCS}#asking`}
                target="_blank"
                rel="noreferrer"
              >
                More on this
              </a>
            </div>
            <div className="mt-2.5">
              <Answer q={`How do I ask ${name} for something?`} href="/agent/email" cta="See his address">
                Reply to any email he sends you, or write to him directly. He reads it, confirms
                what he understood, and gets on with it. There is no special format and no commands
                to learn, so write it the way you would write to a colleague.
              </Answer>
              <Answer q="How do I send him a file?" href="/agent/email" cta="Email setup">
                Email it to him with <span className="font-mono text-[12px]">DOCS</span> in the
                subject line. That tells him the attachment is reference material to work from
                rather than a one off question.
              </Answer>
              <Answer q="He is waiting on a decision from me" href="/approvals" cta="Open approvals">
                Approvals lists everything he has stopped for. Each one has three replies ready to
                go: yes, change something first, or leave it. They open an email with the wording
                filled in, and you can edit it before you send.
              </Answer>
              <Answer q={`${name} got something wrong`} href="/leads" cta="Go to your leads">
                Open the lead and use &ldquo;Anything he got wrong&rdquo;. That is a message to him,
                not an edit to a database: he reads it, confirms, and treats similar ones the same
                way from then on.
              </Answer>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Your leads</Eyebrow>
              <a
                className="text-[12px] text-[color:var(--text-3)] no-underline hover:text-[color:var(--brand-ink)] hover:underline shrink-0"
                href={`${DOCS}#leads`}
                target="_blank"
                rel="noreferrer"
              >
                More on this
              </a>
            </div>
            <div className="mt-2.5">
              <Answer q="What do hot, warm and cold mean?" href="/leads" cta="Open the board">
                They are {name}&rsquo;s read on how close someone is, and he has to give a reason
                for each one. Where he has not judged a lead yet, it sits by how far the outreach
                has got instead. If you move a lead yourself, your call stands and he will not
                quietly move it back.
              </Answer>
              <Answer q="Can I take my leads with me?" href="/settings" cta="Export your leads">
                Yes, whenever you like, without asking us first. Everything he finds is yours.
              </Answer>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Staying in control</Eyebrow>
              <a
                className="text-[12px] text-[color:var(--text-3)] no-underline hover:text-[color:var(--brand-ink)] hover:underline shrink-0"
                href={`${DOCS}#control`}
                target="_blank"
                rel="noreferrer"
              >
                More on this
              </a>
            </div>
            <div className="mt-2.5">
              <Answer q={`How do I stop ${name}?`} href="/agent/how" cta="Stop or start him">
                One button, and it takes effect immediately. Nothing goes out in your name while he
                is stopped, and nothing is lost: he picks up where he left off when you start him
                again. If we have paused him ourselves you will see that on the same page, along
                with how to reach us about it.
              </Answer>
              {supervised && (
                <Answer q="Will he email anyone without asking me?" href="/agent/how" cta="What he will and will not do">
                  No. He researches, drafts and follows up on his own, and stops before anything
                  leaves in your name. That is what supervised means, and you can see the current
                  setting on his page.
                </Answer>
              )}
              <Answer q="Why does he want to text me a code?" href="/agent/email" cta="Set your number">
                When he signs in to a site for you and it sends a one time code, he needs it within
                a minute or the login expires. Email is usually too slow. The number is used for
                that and nothing else, we never share or sell it, and you can reply STOP at any
                time to end it.
              </Answer>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow>Money and access</Eyebrow>
              <a
                className="text-[12px] text-[color:var(--text-3)] no-underline hover:text-[color:var(--brand-ink)] hover:underline shrink-0"
                href={`${DOCS}#billing`}
                target="_blank"
                rel="noreferrer"
              >
                More on this
              </a>
            </div>
            <div className="mt-2.5">
              <Answer q="Where are my invoices?" href="/billing" cta="Open billing">
                Under Billing. Your card and receipts are held by Stripe rather than by us, so we
                never see or store a card number.
              </Answer>
              <Answer q="Can someone else on my team get in?" href="/people" cta="Ask us to add them">
                Not yet by yourself. We have not built shared logins, and rather than show you an
                invite button that does nothing, we would rather you tell us who should have access
                and we will set them up.
              </Answer>
              <Answer q="How do I cancel?" href="/settings" cta="Settings">
                Tell us and we will do it and confirm. It is a message to a person, not a hidden
                setting, and there is no retention call.
              </Answer>
            </div>
          </Panel>
        </div>

        <Panel>
          <Eyebrow>If none of this fits</Eyebrow>
          <p className="text-[13px] text-[color:var(--text-2)] mt-2.5 leading-relaxed">
            Write to{" "}
            <a
              href="mailto:support@ambitt.agency"
              className="text-[color:var(--brand-ink)] underline underline-offset-2"
            >
              support@ambitt.agency
            </a>{" "}
            and a person reads it. Say what you were trying to do and what happened instead, and
            that is enough.
          </p>
          <p className="text-[13px] text-[color:var(--text-2)] mt-3 leading-relaxed">
            You can also just reply to {name}. Anything meant for us rather than for him gets passed
            on.
          </p>

          <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
            <Eyebrow>What we will never do</Eyebrow>
            <ul className="text-[13px] text-[color:var(--text-2)] mt-2.5 leading-relaxed space-y-1.5">
              <li>Sell or share your leads, your contacts, or your number.</li>
              <li>Email anyone as you without the approval you set.</li>
              <li>Hold your data hostage. Export it whenever you want.</li>
            </ul>
          </div>
        </Panel>
      </div>
    </V3Shell>
  );
}
