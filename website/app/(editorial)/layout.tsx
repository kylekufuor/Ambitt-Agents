import type { Metadata } from "next";
import localFont from "next/font/local";
import { IconSprite } from "./_components/icons";
import { Motion } from "./_components/motion";
import { MotionBoot } from "./_components/motion-boot";
import { Sprites } from "./_components/sprites";
import "./editorial.css";
import "./support.css";

/* ---------------------------------------------------------------------------
   Shared root layout for every public marketing, help and legal page.

   Type: Satoshi for everything read; Geist Mono for labels, tags and the UI
   mock text (Seonovu's mono, kept to the small sizes); Roboto for the Gmail
   thread alone.
   - Satoshi is the licensed variable file, byte for byte (ITF Free Font
     License v2.0, public/fonts/Satoshi-FFL.txt). The licence forbids
     subsetting, re-compressing or converting it; next/font only copies it.
     `block` so the headline never flashes a fallback face mid blur-in.
   - Geist Mono (SIL OFL 1.1, public/fonts/GeistMono-OFL.txt), the variable
     file from the `geist` package.
   - Roboto, latin subset, not preloaded: it only appears below the fold.
   --------------------------------------------------------------------------- */
const satoshi = localFont({
  src: "../../public/fonts/satoshi-var.woff2",
  weight: "300 900",
  style: "normal",
  display: "block",
  variable: "--font-satoshi",
  fallback: ["system-ui", "sans-serif"],
});

const geistMono = localFont({
  src: "../../public/fonts/geist-mono-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});

const robotoGmail = localFont({
  src: "../../public/fonts/roboto-gmail.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-roboto-gmail",
  fallback: ["Roboto", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ambitt.agency"),
  title: "Ambitt Agents: your work, your workspace",
  description: "A named agent working in your tools. Receive the results by email and review work, leads and decisions in your Ambitt portal.",
};

export default function EditorialLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: MotionBoot and Lenis stamp classes on <html> before React looks.
    <html lang="en" className={`${satoshi.variable} ${geistMono.variable} ${robotoGmail.variable}`} suppressHydrationWarning>
      <body>
        <MotionBoot />
        <Sprites />
        <IconSprite />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Motion />
      </body>
    </html>
  );
}
