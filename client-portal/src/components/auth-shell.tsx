import { BrandLockup } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

export function AuthShell({ children, headline, sub }: {
  children: React.ReactNode; headline: string; sub: string;
}) {
  return <div className="auth-workspace">
    <header className="auth-header"><a href="https://www.ambitt.agency" aria-label="Ambitt Agents home"><BrandLockup height={24} onDark /></a><ThemeToggle /></header>
    <div className="auth-layout">
      <aside className="auth-story">
        <span className="auth-eyebrow">YOUR AMBITT WORKSPACE</span>
        <h2>A little less to do.<br /><span>A lot more done.</span></h2>
        <p>Your agent's work has a home. Check the latest, make a decision, and get back to your day.</p>
        <ol className="auth-steps">
          <li><span>01</span><div><b>See where things stand</b><p>Your leads and agent activity, in one place.</p></div></li>
          <li><span>02</span><div><b>Give the go-ahead</b><p>Review the actions waiting on your decision.</p></div></li>
          <li><span>03</span><div><b>Make it work your way</b><p>Manage tools, schedules, and billing.</p></div></li>
        </ol>
      </aside>
      <main className="auth-form"><div><span className="auth-eyebrow">CLIENT PORTAL</span><h1>{headline}</h1><p className="auth-sub">{sub}</p><div className="mt-7">{children}</div></div></main>
    </div>
    <footer className="auth-footer"><span>Ambitt Agents</span><a href="mailto:support@ambitt.agency">Need a hand? Contact support ↗</a></footer>
  </div>;
}
