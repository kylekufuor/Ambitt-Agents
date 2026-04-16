import Link from "next/link";
import { Nav } from "./components/nav";
import { Footer } from "./components/footer";

export default function HomePage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />
      <Hero />
      <Benefits />
      <Features />
      <HowItWorks />
      <Services />
      <Pricing />
      <Comparison />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hero — Orb + Gradient atmosphere
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      {/* Background radial */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.06)_0%,transparent_60%)]" />

      {/* Orb */}
      <div className="orb" />
      <div className="orb-ring" />
      <div className="orb-ring-2" />

      {/* Grid lines */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <div className="label-pill mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          AI WORKFORCE FOR BUSINESSES
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-[80px] font-bold tracking-[-0.03em] leading-[1.05] mb-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          Hire an AI agent.
          <br />
          <span className="text-muted-foreground/50">Not another tool.</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up" style={{ animationDelay: "0.3s" }}>
          AI agents that work like your best employee. They connect to your tools,
          do the research, and email you results. No dashboards. No logins. Just work.
        </p>

        <div className="flex items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "0.4s" }}>
          <a
            href="#pricing"
            className="bg-accent hover:bg-accent/90 text-background font-semibold px-8 py-3.5 rounded-xl transition-all duration-300 text-sm hover:shadow-[0_0_30px_rgba(52,211,153,0.25)]"
          >
            Get Started
          </a>
          <a
            href="#how-it-works"
            className="text-muted-foreground font-medium px-8 py-3.5 rounded-xl border border-white/[0.08] hover:border-white/[0.15] hover:text-foreground transition-all duration-300 text-sm hover:bg-white/[0.02]"
          >
            See How It Works
          </a>
        </div>

        <p className="text-muted-foreground/40 text-sm mt-16 italic max-w-md mx-auto animate-fade-up" style={{ animationDelay: "0.5s" }}>
          &ldquo;We harness your data, understand your business, and put AI agents to work
          — then they deliver results directly to your inbox.&rdquo;
        </p>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Benefits
// ---------------------------------------------------------------------------

const benefits = [
  { title: "Email-First, Not Dashboard-First", description: "Your agent emails you briefs, reports, and alerts. You reply with tasks. No app to check, no login to remember.", stat: "0", label: "dashboards needed" },
  { title: "Connected to Your Tools", description: "Agents connect to 850+ tools via Composio — Salesforce, HubSpot, Slack, PostHog, Stripe, and more.", stat: "850+", label: "tool integrations" },
  { title: "They Research, You Decide", description: "Agents search the web, analyze your data, and surface insights. They recommend — you approve. Always in control.", stat: "100%", label: "your control" },
  { title: "Dedicated to Your Business", description: "Each agent has a name, personality, and memory. It learns your brand, your voice, your goals.", stat: "1:1", label: "dedicated agent" },
];

function Benefits() {
  return (
    <section className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Why Ambitt</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Agents that actually work.</h2>
        <p className="text-muted-foreground max-w-xl mb-16 text-lg">
          Not chatbots. Not copilots. Dedicated AI agents that do the work and deliver results to your inbox.
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {benefits.map((b, i) => (
            <div key={b.title} className="glass-card rounded-2xl p-8 group">
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold text-accent font-mono">{b.stat}</span>
                <span className="text-muted-foreground/50 text-xs uppercase tracking-wider">{b.label}</span>
              </div>
              <h3 className="text-foreground font-semibold text-lg mb-2">{b.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const features = [
  { icon: "⚡", title: "Agentic Runtime", description: "Claude-powered loop: reason, use tools, analyze results, loop again. Up to 10 tool calls per task." },
  { icon: "🔗", title: "850+ Tool Connections", description: "Connect any tool via Composio — CRM, analytics, support, marketing, finance. Your tools, their hands." },
  { icon: "🔍", title: "Web Research", description: "Built-in web search for competitive intel, market research, review monitoring, and prospect research." },
  { icon: "📄", title: "PDF & CSV Reports", description: "Branded PDF reports and CSV data exports, attached directly to emails. Professional deliverables." },
  { icon: "⏰", title: "Smart Scheduling", description: "Daily, weekly, or custom cron. Runs autonomously and emails you results on time, every time." },
  { icon: "🧠", title: "Document Memory", description: "Upload SOPs, brand guides, and internal docs. Your agent studies and references them in every interaction." },
];

function Features() {
  return (
    <section id="features" className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Capabilities</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything your agent can do.</h2>
        <p className="text-muted-foreground max-w-xl mb-16 text-lg">
          Built on Claude, connected to your tools, and designed to deliver real work — not just answers.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-7 group">
              <div className="text-2xl mb-4 w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center group-hover:border-accent/20 transition-colors duration-300">
                {f.icon}
              </div>
              <h3 className="text-foreground font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How It Works
// ---------------------------------------------------------------------------

const steps = [
  { step: "01", title: "Create Your Agent", description: "Pick a name, choose a purpose, and connect your tools. Takes under 60 seconds from our dashboard." },
  { step: "02", title: "Connect Your Tools", description: "OAuth or API key — your agent connects to Salesforce, PostHog, Slack, Resend, or any of 850+ apps." },
  { step: "03", title: "Agent Goes to Work", description: "Your agent runs on schedule or on demand. It uses your tools, does the research, and emails you results." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Process</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Create. Connect. Work.</h2>
        <p className="text-muted-foreground max-w-xl mb-16 text-lg">
          Three steps from signup to your first agent delivering real results.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.step} className="relative">
              <div className="text-[80px] font-bold font-mono leading-none text-accent/10 mb-4">{s.step}</div>
              <h3 className="text-foreground font-semibold text-xl mb-3">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const agentTypes = [
  { title: "Analytics Agent", description: "Monitors your metrics, surfaces insights, and sends you weekly digests with what changed and why it matters.", icon: "📊" },
  { title: "Sales Agent", description: "Researches prospects, qualifies leads, and sends you a curated list with contact info and outreach drafts.", icon: "🎯" },
  { title: "Support Agent", description: "Tracks ticket volume, identifies recurring issues, and alerts you when something needs attention.", icon: "💬" },
  { title: "Operations Agent", description: "Monitors your systems, tracks project progress, and sends status updates to your team.", icon: "⚙️" },
];

function Services() {
  return (
    <section className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Agent Types</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">An agent for every role.</h2>
        <p className="text-muted-foreground max-w-xl mb-16 text-lg">
          Each agent specializes in a domain and connects to the tools that matter for that job.
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {agentTypes.map((a) => (
            <div key={a.title} className="glass-card rounded-2xl p-8 group">
              <div className="text-3xl mb-4">{a.icon}</div>
              <h3 className="text-foreground font-semibold text-xl mb-2">{a.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const plans = [
  {
    name: "Starter", price: "$499", period: "/month",
    description: "One agent, connected to your tools. Perfect for getting started.",
    features: ["1 AI agent", "Unlimited tool connections", "1,000 interactions/month", "Overage at $0.60/interaction", "Email delivery", "Weekly digest reports", "Web research"],
    popular: false,
  },
  {
    name: "Growth", price: "$999", period: "/month",
    description: "Multiple agents working together. Built for growing teams.",
    features: ["Up to 2 AI agents", "Unlimited tool connections", "3,000 interactions/month", "Overage at $0.40/interaction", "Email + PDF reports", "Custom schedules", "Document memory", "Priority support"],
    popular: true,
  },
  {
    name: "Scale", price: "$2,499", period: "/month",
    description: "Full AI workforce. For businesses ready to operate differently.",
    features: ["Up to 3 AI agents", "Unlimited tool connections", "10,000 interactions/month", "Overage at $0.30/interaction", "Email + PDF + CSV exports", "Custom schedules", "Document memory", "Dedicated onboarding", "Slack support"],
    popular: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Pricing</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Simple pricing. No surprises.</h2>
        <p className="text-muted-foreground max-w-xl mb-16 text-lg">
          Every plan includes the full agent runtime, tool connections, and email delivery.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-7 relative ${
                p.popular
                  ? "gradient-border shadow-[0_0_60px_rgba(52,211,153,0.06)]"
                  : "glass-card"
              }`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-7">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                    Popular
                  </span>
                </div>
              )}
              <h3 className="text-foreground font-bold text-xl mt-2">{p.name}</h3>
              <div className="flex items-baseline gap-1 mt-3 mb-3">
                <span className="text-4xl font-bold text-foreground tracking-tight">{p.price}</span>
                <span className="text-muted-foreground/50 text-sm">{p.period}</span>
              </div>
              <p className="text-muted-foreground text-sm mb-7 leading-relaxed">{p.description}</p>

              <ul className="space-y-3 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm">
                    <span className="text-accent text-xs mt-1">&#10003;</span>
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="/contact"
                className={`block text-center py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  p.popular
                    ? "bg-accent text-background hover:shadow-[0_0_25px_rgba(52,211,153,0.25)]"
                    : "bg-white/[0.04] text-foreground border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.06]"
                }`}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function Comparison() {
  const rows = [
    { ambitt: "Dedicated agent per client", others: "Shared chatbot" },
    { ambitt: "Emails you results proactively", others: "You log in and ask" },
    { ambitt: "Connected to your real tools", others: "Generic integrations" },
    { ambitt: "Learns your business over time", others: "Starts fresh every time" },
    { ambitt: "PDF reports + CSV exports", others: "Chat transcript" },
    { ambitt: "Runs on a schedule automatically", others: "Manual prompting" },
  ];

  return (
    <section className="relative section-glow py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="label-pill mb-6">Comparison</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-16">Ambitt vs. the rest.</h2>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="grid grid-cols-2">
            <div className="px-7 py-4 border-b border-white/[0.06] bg-accent/[0.04]">
              <p className="text-accent text-[11px] font-bold uppercase tracking-[2px]">Ambitt Agents</p>
            </div>
            <div className="px-7 py-4 border-b border-white/[0.06]">
              <p className="text-muted-foreground/50 text-[11px] font-bold uppercase tracking-[2px]">Everyone Else</p>
            </div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 border-b border-white/[0.03] last:border-0">
              <div className="px-7 py-4 bg-accent/[0.02]">
                <p className="text-sm text-foreground/90 flex items-center gap-2">
                  <span className="text-accent text-xs">&#10003;</span> {r.ambitt}
                </p>
              </div>
              <div className="px-7 py-4">
                <p className="text-sm text-muted-foreground/50 flex items-center gap-2">
                  <span className="text-red-400/60 text-xs">&#10007;</span> {r.others}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

const testimonials = [
  { quote: "Our agent researches 50 prospects every Monday and emails me a qualified list with contact info. It replaced 10 hours of manual work.", name: "Placeholder", role: "Founder" },
  { quote: "I just reply to my agent's email with what I need. It connects to our PostHog and sends me a report 5 minutes later. No dashboard needed.", name: "Placeholder", role: "Head of Growth" },
  { quote: "The weekly digest catches things I'd miss — a drop in signups, a spike in churn. My agent flags it before it becomes a problem.", name: "Placeholder", role: "COO" },
];

function Testimonials() {
  return (
    <section className="relative section-glow py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-pill mb-6">Testimonials</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-16">Real results, not promises.</h2>

        <div className="grid md:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div key={i} className="glass-card rounded-2xl p-7">
              <div className="text-accent/30 text-4xl font-serif mb-4">&ldquo;</div>
              <p className="text-muted-foreground text-sm leading-relaxed mb-8">{t.quote}</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-accent">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">{t.name}</p>
                  <p className="text-muted-foreground/50 text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const faqs = [
  { q: "What does an AI agent actually do?", a: "An agent connects to your tools (CRM, analytics, support, etc.), runs tasks on a schedule or on-demand, and emails you results. It researches, analyzes, generates reports, and recommends actions — like a remote contractor that never sleeps." },
  { q: "Do I need technical expertise?", a: "No. You create an agent from our dashboard, connect your tools with OAuth (one click), and communicate via email. If you can reply to an email, you can use Ambitt." },
  { q: "How long until my agent is working?", a: "Under 60 seconds to create. Once you connect tools and approve, your agent starts immediately. Upload documents to give it deeper context about your business." },
  { q: "Is my data safe?", a: "All credentials are encrypted at rest with AES-256-GCM. Each agent is fully isolated — credentials, memory, and conversation history are never shared between clients." },
  { q: "What tools can my agent connect to?", a: "850+ tools via Composio — Salesforce, HubSpot, Stripe, PostHog, Slack, Google Analytics, Notion, Asana, Zendesk, Shopify, and hundreds more." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no lock-in. Pause or cancel from your client portal. Your agent stops immediately." },
];

function FAQ() {
  return (
    <section id="faq" className="relative section-glow py-28 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="label-pill mb-6">FAQ</div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-16">Questions? Answers.</h2>

        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group glass-card rounded-2xl overflow-hidden">
              <summary className="px-7 py-5 cursor-pointer text-foreground/90 font-medium text-[15px] flex items-center justify-between hover:text-foreground transition-colors duration-300">
                {f.q}
                <span className="text-muted-foreground/40 group-open:rotate-45 transition-transform duration-300 text-xl ml-4 shrink-0">+</span>
              </summary>
              <div className="px-7 pb-5">
                <p className="text-muted-foreground text-sm leading-relaxed">{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

function CTA() {
  return (
    <section className="relative py-28 px-6 overflow-hidden">
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.06)_0%,transparent_60%)]" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Ready to hire your first agent?</h2>
        <p className="text-muted-foreground text-lg mb-10 max-w-lg mx-auto leading-relaxed">
          Create an agent in under 60 seconds. Connect your tools. Start getting results in your inbox.
        </p>
        <a
          href="/contact"
          className="inline-block bg-accent hover:bg-accent/90 text-background font-semibold px-10 py-4 rounded-xl transition-all duration-300 text-sm hover:shadow-[0_0_40px_rgba(52,211,153,0.25)]"
        >
          Get Started
        </a>
      </div>
    </section>
  );
}
