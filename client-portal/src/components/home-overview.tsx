import Link from "next/link";
import { AgentAvatar } from "./brand-mark";
import { PageHead, Eyebrow } from "./v3-ui";
import { describeAgentStatus, describeSchedule } from "@/lib/agent-presentation";
import { presentLeadName, presentTemperature, presentText } from "@/lib/lead-presentation";
import type { PortalContext } from "@/lib/portal-context";

type HomeAgent = Pick<NonNullable<PortalContext["agent"]>, "name" | "email" | "status" | "pausedBy" | "nextScheduledRun" | "timezone" | "schedule" | "clientDescription">;
export interface HomeOverviewProps {
  greeting: string;
  agent: HomeAgent | null;
  leadsTotal: number;
  leadsThisWeek: number;
  sentThisWeek: number;
  pendingApprovals: number;
  hotLeads: Array<{ id: string; name: string | null; company: string | null; status: string; temperature: string | null; temperatureReason: string | null; temperatureSetBy: string | null }>;
}

const Arrow = () => <span aria-hidden="true">↗</span>;

/** Presentation separated from the authenticated queries, including all quiet states. */
export function HomeOverview({ greeting, agent, leadsTotal, leadsThisWeek, sentThisWeek, pendingApprovals, hotLeads }: HomeOverviewProps) {
  if (!agent) return <>
    <PageHead title={`Hello, ${greeting}.`} sub="Your workspace starts here." />
    <section className="home-welcome v3-panel">
      <AgentAvatar size={56} />
      <Eyebrow>Getting started</Eyebrow>
      <h2>Your agent is being set up.</h2>
      <p>We are preparing your agent for their first day. They will email you when they are ready, with the work they are going to do first.</p>
      <Link href="/help" className="btn btn-secondary">Talk to our team <Arrow /></Link>
    </section>
  </>;

  const status = describeAgentStatus(agent);
  return <>
    <PageHead title={`Hello, ${greeting}.`} sub="Your work, and what needs you next."
      right={<Link href="/activity" className="btn btn-secondary btn-sm">View activity <Arrow /></Link>} />
    <div className="home-workspace">
      <div className="home-work">
        <section className="home-brief v3-panel">
          <div className="home-section-line"><Eyebrow>The last 7 days</Eyebrow><span className="home-period">Your weekly picture</span></div>
          <h2>{leadsThisWeek || sentThisWeek ? "Here's where things stand." : "A quiet week so far."}</h2>
          <p className="home-intro">{agent.clientDescription ? presentText(agent.clientDescription) : `${agent.name}'s work arrives in your inbox. This is where you can check in on it.`}</p>
          <dl className="home-numbers">
            <div><dt>New leads in your workspace</dt><dd>{leadsThisWeek.toLocaleString("en-US")}</dd></div>
            <div><dt>Emails sent by {agent.name}</dt><dd>{sentThisWeek.toLocaleString("en-US")}</dd></div>
          </dl>
        </section>

        <section className="home-decisions" data-pending={pendingApprovals > 0}>
          <span className="home-decision-count" aria-hidden="true">{pendingApprovals > 0 ? pendingApprovals : "✓"}</span>
          <div>
            <Eyebrow>Waiting on you</Eyebrow>
            <h2>{pendingApprovals > 0 ? `${pendingApprovals === 1 ? "One decision" : `${pendingApprovals} decisions`} before the next step.` : "You're all caught up."}</h2>
            <p>{pendingApprovals > 0 ? "Review the proposed actions and decide what goes ahead." : agent.status === "active" ? `${agent.name} will email you when a decision needs your attention.` : "There are no pending approvals. Your agent's current status is shown alongside."}</p>
          </div>
          {pendingApprovals > 0 && <Link href="/approvals" className="btn btn-primary btn-sm">Review <Arrow /></Link>}
        </section>

        <section className="home-leads v3-panel">
          <div className="home-section-line">
            <div><Eyebrow>Your book</Eyebrow><h2>Worth a closer look</h2></div>
            <Link href="/leads" className="home-text-link">All {leadsTotal.toLocaleString("en-US")} leads <Arrow /></Link>
          </div>
          {hotLeads.length > 0 ? <ul className="home-lead-list">{hotLeads.map(lead => {
            const name = presentLeadName(lead.name);
            const temperature = presentTemperature(lead);
            return <li key={lead.id}><Link href={`/leads/${lead.id}`}>
              <span className="home-lead-initial" aria-hidden="true">{name.title.slice(0, 1).toUpperCase()}</span>
              <span className="home-lead-copy"><strong>{name.title}</strong><span>{temperature.reason || presentText(lead.company) || "Open the lead to see the details."}</span></span>
              <span className="home-hot">Hot</span><Arrow />
            </Link></li>;
          })}</ul> : <div className="home-quiet"><p>{leadsTotal === 0 ? "Your first lead will appear here." : "No leads are marked hot right now."}</p><span>{leadsTotal === 0 ? `${agent.name} hasn't logged a lead yet. You can still review their activity.` : "You can open your book to see every lead and its latest status."}</span></div>}
        </section>
      </div>

      <aside className="home-agent" aria-label="Your agent">
        <div className="home-agent-identity"><AgentAvatar size={48} /><div><Eyebrow>Your agent</Eyebrow><h2>{agent.name}</h2></div></div>
        <div className="home-agent-status"><span style={{ background: status.dot }} /><b>{status.label}</b></div>
        <p className="home-agent-next">{status.line}</p>
        <div className="home-agent-block"><Eyebrow>Working schedule</Eyebrow><p>{describeSchedule(agent.schedule)}</p><span>{agent.timezone.replaceAll("_", " ")}</span><Link href="/agent/how" className="home-text-link">Manage how they work <Arrow /></Link></div>
        <div className="home-agent-block"><Eyebrow>A direct line</Eyebrow><p>Have something for {agent.name}?</p><span>Send a brief or reply to their latest email.</span><a href={`mailto:${agent.email}`} className="btn btn-primary home-email">Email {agent.name} <Arrow /></a></div>
        <Link href="/agent/tools" className="home-agent-setting"><span>Connected tools</span><Arrow /></Link>
        <Link href="/agent/email" className="home-agent-setting"><span>Email preferences</span><Arrow /></Link>
      </aside>
    </div>
  </>;
}
