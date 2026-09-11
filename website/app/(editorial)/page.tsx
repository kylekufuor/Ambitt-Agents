import { Footer } from "./_components/footer";
import { Cta } from "./_components/home/cta";
import { Faq } from "./_components/home/faq";
import { Features } from "./_components/home/features";
import { Hero } from "./_components/home/hero";
import { How } from "./_components/home/how";
import { HowWeWork } from "./_components/home/how-we-work";
import { Logos } from "./_components/home/logos";
import { PortalSection } from "./_components/home/portal";
import { Pricing } from "./_components/home/pricing";
import { ToolsSection } from "./_components/home/tools";
import { Masthead } from "./_components/masthead";
import { pageMetadata } from "./_components/metadata";

export const metadata = pageMetadata({
  path: "/",
  title: "Ambitt Agents: you hired someone, not a seat",
  description:
    "Every agent has a name, an inbox, and a standing job. Ask once, and the finished work comes back in the inbox you already read.",
});

export default function HomePage() {
  return (
    <>
      <Masthead page="home" />
      <main id="main">
        <Hero />
        <Logos />
        <Features />
        <How />
        <HowWeWork />
        <PortalSection />
        <ToolsSection />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer page="home" />
    </>
  );
}
