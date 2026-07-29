import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* ---------------------------------------------------------------------------
   DM Sans — ONE family, display through legal. No display/body pairing.
   Self-hosted woff2 (SIL OFL 1.1, licence in public/fonts/DM-Sans-OFL.txt).
   Never a CDN <link>: a silent webfont fallback is the failure we design
   against, so the bytes ship with the app.

   Variable file carries BOTH axes (opsz 9–40, wght 100–1000), so
   `font-optical-sizing: auto` gives the hero a true display cut rather than
   text shapes scaled up. One 62 kB file is smaller than the three static
   weights (400/500/600) it replaces.

   Split latin / latin-ext by unicode-range: the ext file is only fetched when
   a client or agent name actually needs it, and is not preloaded.
   --------------------------------------------------------------------------- */
const dmSansExt = localFont({
  src: "../public/fonts/dm-sans-ext.woff2",
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
  src: "../public/fonts/dm-sans.woff2",
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

export const metadata: Metadata = {
  metadataBase: new URL("https://ambitt.agency"),
  title: "Ambitt Agents — named AI agents that do the work in your tools",
  description:
    "Hire a named AI agent that works inside the tools you already use and emails you the finished work. You ask in plain English. It does the job. You never have to log in.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/ambitt-agents-favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Ambitt Agents — named AI agents that do the work in your tools",
    description:
      "You ask in plain English. It does the job inside the tools you already use, and emails you the finished work. You never have to log in.",
    url: "https://ambitt.agency",
    siteName: "Ambitt Agents",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSansExt.variable}`}>
      <body>{children}</body>
    </html>
  );
}
