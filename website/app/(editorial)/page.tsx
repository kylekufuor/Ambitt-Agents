import { preload } from "react-dom";
import { Footer } from "./_components/footer";
import { Contact } from "./_components/home/contact";
import { Hero } from "./_components/home/hero";
import { HowWeWork } from "./_components/home/how-we-work";
import { PortalSection } from "./_components/home/portal";
import { Pricing } from "./_components/home/pricing";
import { ToolsSection } from "./_components/home/tools";
import { Masthead } from "./_components/masthead";
import { pageMetadata } from "./_components/metadata";
import { PHOTOS } from "./_components/photos";

export const metadata = pageMetadata({
  path: "/",
  title: "Ambitt Agents: you hired someone, not a seat",
  description:
    "Every agent has a name, an inbox, and a standing job. Ask once, and the finished work comes back in the inbox you already read.",
});

export default function HomePage() {
  // The hero photograph is a CSS background, which the browser would otherwise
  // find only after styles are applied. Start it with the document instead.
  preload(PHOTOS.hero.src, { as: "image" });
  return (
    <>
      <Masthead page="home" />
      <main id="main">
        <Hero />
        <HowWeWork />
        <PortalSection />
        <ToolsSection />
        <Pricing />
        <Contact />
      </main>
      <Footer page="home" />
    </>
  );
}
