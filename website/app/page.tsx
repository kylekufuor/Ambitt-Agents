import { Nav } from "./components/nav";
import { Footer } from "./components/footer";
import { Hero } from "./components/home/hero";
import { ToolsStrip } from "./components/home/tools-strip";
import { JobSections } from "./components/home/job-sections";
import { Roster } from "./components/home/roster";
import { HowItWorks } from "./components/home/how-it-works";
import { Proof } from "./components/home/proof";
import { Trust } from "./components/home/trust";
import { Plans } from "./components/home/plans";
import { Faq } from "./components/home/faq";
import { MissionCta } from "./components/home/mission-cta";
import { Founder } from "./components/home/founder";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ToolsStrip />
        <JobSections />
        <Roster />
        <HowItWorks />
        <Proof />
        <Trust />
        <Plans />
        <Faq />
        <MissionCta />
        <Founder />
      </main>
      <Footer />
    </>
  );
}
