import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/* ---------------------------------------------------------------------------
   DM Sans + DM Mono — the same family the marketing site and the client portal
   use. Self-hosted woff2 (SIL OFL 1.1, licence alongside the files in
   public/fonts). No CDN <link>, no next/font/google: the bytes ship with the
   app, so an operator on a bad connection never gets a silent fallback while
   reading a fleet-safety screen.

   Variable file carries both axes (opsz 9–40, wght 100–1000) so
   `font-optical-sizing: auto` keeps 11px table labels legible while the 24px
   page titles get the display cut. One 62 kB file, all weights.
   --------------------------------------------------------------------------- */
const dmSansExt = localFont({
  src: "../../public/fonts/dm-sans-ext.woff2",
  weight: "100 1000",
  display: "swap",
  preload: false,
  variable: "--font-dm-sans-ext",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      // Inlined, not a const: next/font parses these arguments statically and
      // silently drops anything it cannot resolve at build time.
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

const dmSans = localFont({
  src: "../../public/fonts/dm-sans.woff2",
  weight: "100 1000",
  display: "swap",
  variable: "--font-dm-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});

// DM Mono — agent ids, cron strings, tool slugs, raw JSON in the quote editor.
const dmMono = localFont({
  src: "../../public/fonts/dm-mono.woff2",
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-dm-mono",
  fallback: ["SF Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Ambitt Dashboard",
  description: "AI workforce operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSansExt.variable} ${dmMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('ambitt-theme') === 'light') {
              document.documentElement.classList.remove('dark');
            }
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
