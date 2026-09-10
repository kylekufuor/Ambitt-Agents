import localFont from "next/font/local";
import { Motion } from "./_components/motion";
import { Sprites } from "./_components/sprites";
import { ThemeBoot } from "./_components/theme-boot";
import "./editorial.css";

/* ---------------------------------------------------------------------------
   Root layout for the editorial pages: `/` and `/use-cases`.

   A root layout of its own (the rest of the site lives under app/(site)/ with
   Tailwind and globals.css) because the two stylesheets were written for
   different pages and would collide: Tailwind's preflight restyles bare
   elements this design depends on. Next does a full page load when a visitor
   crosses between root layouts, so neither stylesheet ever sees the other's
   markup.

   Type: Satoshi carries every structural voice; Newsreader, a variable
   optical-size serif, is admitted only for argument headlines (roman) and pull
   quotes (italic). Roboto is for the Gmail thread alone.
   - Satoshi is the licensed variable file, byte for byte (ITF Free Font
     License v2.0, public/fonts/Satoshi-FFL.txt). The licence forbids
     subsetting, re-compressing or converting it; next/font only copies it.
     `block` so the masked headlines never flash a fallback face.
   - Newsreader (SIL OFL 1.1, public/fonts/Newsreader-OFL.txt), latin subset.
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

const newsreader = localFont({
  src: [
    { path: "../../public/fonts/newsreader-roman.woff2", weight: "400 600", style: "normal" },
    { path: "../../public/fonts/newsreader-italic.woff2", weight: "400 600", style: "italic" },
  ],
  display: "swap",
  variable: "--font-newsreader",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
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

export default function EditorialLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: ThemeBoot may set data-theme on <html> before React hydrates.
    <html lang="en" className={`${satoshi.variable} ${newsreader.variable} ${robotoGmail.variable}`} suppressHydrationWarning>
      <body>
        <ThemeBoot />
        <Sprites />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <Motion />
      </body>
    </html>
  );
}
