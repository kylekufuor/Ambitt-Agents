import { Btn, Kicker } from "../primitives";
import { PHOTOS } from "../photos";

export function CasesIntro() {
  return <section className="section workflow-intro"><div className="wrap">
    <div className="workflow-intro-grid">
      <div><Kicker>Inside the app</Kicker><h1 className="h1">See the work.<br /><span className="accent">Follow every step.</span></h1><p className="dek">Four everyday workflows, recorded in the portal. See what your agent brings back and where you take the next step.</p><div className="support-actions"><Btn href="#bookkeeping" icon="arrow-up-right">Watch a workflow</Btn><Btn href="https://portal.ambitt.agency" kind="ghost">Open portal</Btn></div><p className="workflow-disclosure">All businesses, records and results in these demos are fictional.</p></div>
      <figure className="workflow-preview"><img src="/demos/portal-home-dark.webp" alt="The current Ambitt portal: weekly overview, pending decisions and agent details, with fictional data" width="1440" height="1000" fetchPriority="high" /><figcaption>The overview. Your first stop in the workspace.</figcaption></figure>
    </div>
    <nav className="workflow-index" aria-label="Choose a workflow">
      {[{id:"bookkeeping",name:"Bookkeeping",detail:"Review invoice reminders",photo:PHOTOS.bookkeeping},{id:"commercial-real-estate",name:"Real estate",detail:"Screen and organize leads",photo:PHOTOS.commercialRealEstate},{id:"home-services",name:"Roofing",detail:"Keep up with enquiries",photo:PHOTOS.homeServices},{id:"tax-and-accounting",name:"Tax & accounting",detail:"Chase missing documents",photo:PHOTOS.taxAccounting}].map((item,i)=><a href={`#${item.id}`} key={item.id}><img src={item.photo.src} alt="" width="80" height="80" /><div><span>0{i+1} / {item.name}</span><p>{item.detail}</p></div><span aria-hidden="true">↗</span></a>)}
    </nav>
  </div></section>;
}
