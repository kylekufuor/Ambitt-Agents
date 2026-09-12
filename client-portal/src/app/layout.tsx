import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* ---------------------------------------------------------------------------
   Satoshi + DM Mono — ONE family across the portal and the marketing site
   (the marketing site was already on Satoshi; this brings the portal in
   line — the operator dashboard and email templates are untouched, see
   below). Self-hosted woff2 (ITF Free Font License v2.0, licence text
   alongside the files in public/fonts). Never a CDN <link>, and never
   next/font/google: the bytes ship with the app so there is no silent
   fallback to argue with.

   Satoshi is a single variable file covering wght 300–900, normal style
   only, and needs no unicode-range split: it already covers latin,
   latin-1, latin-ext and the euro sign in one file, so the old two-file
   latin / latin-ext trick DM Sans needed is dead weight here. One 42 kB
   file replaces what used to be 62 kB + a 31 kB ext file.

   Satoshi has no opsz axis (DM Sans did — that's why the old comment here
   talked about optical sizing). `font-optical-sizing` has nothing to act
   on with this face; see the note in globals.css where it's been dropped.

   Italic (satoshi-italic-var.woff2) ships licensed in public/fonts/ but is
   NOT wired in here: next/font/local only exposes one `preload` flag per
   call, and it applies to every file in `src`, so adding italic to this
   face would force-preload 43 kB of a style the portal never renders today
   (no `italic` class, no `font-style: italic` anywhere in src/) on every
   route. Wire it in with its own `src` entry the day italic is actually
   needed; until then this is the cheaper, honest choice.

   DM Mono is unchanged below — Satoshi has no monospace companion and the
   mono surfaces (schedules, agent addresses, the login code) still need a
   fixed-width face. See client-portal/DESIGN.md for the weight and
   tracking rules.
   --------------------------------------------------------------------------- */
const satoshi = localFont({
  src: "../../public/fonts/satoshi-var.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
  variable: "--font-satoshi",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

// DM Mono — schedules, agent addresses, the login code. Sparse enough that it
// is not preloaded; it loads when a mono surface actually renders.
const dmMono = localFont({
  src: "../../public/fonts/dm-mono.woff2",
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-dm-mono",
  fallback: ["SF Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Ambitt Agents",
  description: "Manage your custom AI agent — its tools, voice, knowledge, and what it does on your behalf.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      // Browser extensions (1Password, Grammarly, adblockers) inject inline
      // styles onto <html> before React hydrates — `suppressHydrationWarning`
      // silences the resulting top-level mismatch without hiding real bugs
      // deeper in the tree (React only suppresses one level).
      suppressHydrationWarning
      className={`${satoshi.variable} ${dmMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('ambitt-appearance');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
