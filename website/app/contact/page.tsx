import type { Metadata } from "next";
import { Nav } from "../components/nav";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Contact — Ambitt Agents",
  description: "Get in touch with the Ambitt team. Book a call or send us a message.",
};

export default function ContactPage() {
  return (
    <main className="overflow-x-hidden">
      <Nav />

      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.04)_0%,transparent_60%)]" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="label-pill mb-6">Contact</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">Reach us anytime.</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            Have a question, want a demo, or ready to get started? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Options */}
      <section className="pb-28 px-6">
        <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-5">
          <div className="glass-card rounded-2xl p-8">
            <div className="label-pill mb-5">Book a Call</div>
            <h2 className="text-foreground font-semibold text-xl mb-3">15-minute intro call</h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              See a live demo of an agent connected to your tools. We&apos;ll show you exactly how it works for your business.
            </p>
            <a
              href="https://calendly.com/ambitt"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center bg-accent text-background py-3 rounded-xl text-sm font-semibold hover:shadow-[0_0_25px_rgba(52,211,153,0.25)] transition-all duration-300"
            >
              Book on Calendly
            </a>
          </div>

          <div className="glass-card rounded-2xl p-8">
            <div className="label-pill mb-5">Email Us</div>
            <h2 className="text-foreground font-semibold text-xl mb-3">Response within 24 hours</h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Questions about pricing, capabilities, integrations, or anything else? Just email us.
            </p>
            <a
              href="mailto:support@ambitt.agency"
              className="block text-center bg-white/[0.04] text-foreground py-3 rounded-xl text-sm font-semibold border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.06] transition-all duration-300"
            >
              support@ambitt.agency
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative section-glow pb-28 px-6 pt-28">
        <div className="max-w-3xl mx-auto">
          <div className="label-pill mb-6">FAQ</div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-16">Common questions.</h2>

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

      <Footer />
    </main>
  );
}

const faqs = [
  { q: "What services do you offer?", a: "We build and deploy dedicated AI agents for businesses. Each agent connects to your tools, runs tasks on a schedule, and emails you results — analytics, research, reports, alerts, and more." },
  { q: "How long does it take to get started?", a: "Under 60 seconds to create an agent. Connect your tools via OAuth, approve the agent, and it starts working immediately. Upload documents to give it deeper business context." },
  { q: "Do I need technical expertise?", a: "No. You create agents from our dashboard, connect tools with one click, and communicate via email. If you can reply to an email, you can use Ambitt." },
  { q: "Is my data safe?", a: "All credentials are encrypted at rest with AES-256-GCM. Each agent is fully isolated per client. We follow strict data privacy protocols and never log sensitive data in plaintext." },
  { q: "Can AI really help my business grow?", a: "Yes. Our agents automate research, monitor metrics, surface insights, and generate reports — freeing you to focus on decisions. Clients typically save 10+ hours per week on tasks their agents handle." },
];
