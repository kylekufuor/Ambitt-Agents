import { Btn, Kicker } from "../primitives";

export const WORKFLOWS = [
  { id: "bookkeeping", video: "bookkeeping", industry: "Bookkeeping", business: "Cedar Workshop", title: "Two overdue invoices. One clear next step.", brief: "Review the receivables and draft reminders. Let me approve them before they go out.", steps: [["See what needs you", "Start with the weekly overview and the decisions waiting for review."], ["Read the proposed action", "Open Approvals to see the reminders, their context, and why the agent recommends them."], ["Give the go-ahead", "Use the email reply options to approve, request a change, or leave it. The recording stops before any message is sent."]] },
  { id: "commercial-real-estate", video: "real-estate", industry: "Commercial real estate", business: "Harbor Property Group", title: "From a lead list to a focused review.", brief: "Keep the property leads organized. Show me what is warm, what is ready, and what needs a decision.", steps: [["Check the overview", "See new leads and the agent's recent work in Home."], ["Follow the opportunities", "Open the lead board for priorities, then switch to the table to compare the records and contact history."], ["Review the next step", "Open the proposed outreach in Approvals. Read the reason before deciding what goes ahead."]] },
  { id: "home-services", video: "roofing", industry: "Home services · roofing", business: "Cedar Roofing", title: "Keep the follow-up list moving.", brief: "Organize our existing homeowner enquiries and prepare the next follow-ups for my review.", steps: [["Start with the week", "Check the leads, emails and decisions in the weekly overview."], ["Find who is ready", "The lead board groups enquiries by priority and gives a reason for each rating."], ["Review the follow-up", "Read the proposed next steps in Approvals. Send your decision by email when you are ready."]] },
  { id: "tax-and-accounting", video: "tax-accounting", industry: "Tax & accounting", business: "Northline Tax", title: "A shorter list of missing documents.", brief: "Prepare reminders for the missing client documents. Show our team the wording and hold them for approval.", steps: [["Find the decisions", "Home brings the pending reviews together so the team knows where to start."], ["Read the context", "Approvals shows which documents are missing and the proposed actions for each client."], ["Choose the next step", "Approve by email, ask for different wording, or decline. No email is sent in the demo."]] },
] as const;

export function WorkflowCases() {
  return <>{WORKFLOWS.map((workflow, index) => <section className="section ruled workflow-case" id={workflow.id} key={workflow.id}>
    <div className="wrap">
      <div className="workflow-heading"><div><Kicker>{`0${index + 1} / ${workflow.industry}`}</Kicker><h2 className="h2">{workflow.title}</h2></div><p className="workflow-brief"><span>THE BRIEF</span>{workflow.brief}</p></div>
      <div className="workflow-grid">
        <ol className="workflow-steps">{workflow.steps.map(([title, detail], i) => <li key={title}><span className="workflow-step-number">0{i + 1}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
        <figure className="workflow-film">
          <div className="workflow-film-bar"><span>{workflow.business}</span><span>Fictional workspace</span></div>
          <video controls playsInline preload="metadata" width="1440" height="1000" poster={`/demos/cases/${workflow.video}.webp`} aria-label={`${workflow.industry} portal walkthrough with fictional data`}>
            <source src={`/demos/cases/${workflow.video}-narrated.mp4`} type="video/mp4" />
            <track kind="captions" src={`/demos/cases/${workflow.video}-narrated.vtt`} srcLang="en" label="English" default />
            Your browser does not support video. The steps beside it describe the workflow.
          </video>
          <figcaption>Play with sound for the guided walkthrough. Captions follow the narration. Recorded from the portal with fictional data.</figcaption>
        </figure>
      </div>
      <div className="workflow-footer"><p>Example workflow for a configured agent. Scope and connected tools are agreed for each custom build.</p><a href="/docs#approvals" className="text-link">How approvals work ↗</a></div>
    </div>
  </section>)}</>;
}

export function WorkflowClose() {
  return <section className="section room-light close"><div className="wrap"><Kicker>Your turn</Kicker><h2 className="h2">What would you hand over?</h2><p className="dek">Tell us the job and the tools involved. We will work through the setup and the decisions you want to keep.</p><div className="ctas"><Btn href="/#contact" icon="arrow-up-right">Talk to us</Btn><Btn href="/#pricing" kind="ghost">Explore the plans</Btn></div></div></section>;
}
