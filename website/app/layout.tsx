import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* ---------------------------------------------------------------------------
   Satoshi — ONE family, display through legal. No display/body pairing.
   Matches the editorial homepage and use-cases pages (which carry their own
   inline Satoshi) and the client portal, so a visitor moving from `/` to
   /docs or the legal pages never sees the letterforms change.

   Self-hosted woff2 (ITF Free Font License v2.0, note in
   public/fonts/Satoshi-FFL.txt). Never a CDN <link>: a silent webfont
   fallback is the failure we design against, so the bytes ship with the app.
   The file is the portal's, byte for byte. The licence forbids subsetting or
   re-compressing it, so never run it through a font tool.

   One variable file, wght 300–900, normal style only. It covers basic latin,
   92 of 96 Latin-1 and 115 of 128 Latin Extended-A codepoints plus the euro
   sign in one file, so the latin / latin-ext unicode-range split DM Sans
   needed is gone (42 kB replaces 62 kB + 31 kB).
   Satoshi has no opsz axis, so optical sizing is dropped too (globals.css).
   The site never loaded DM Mono, so there is no mono face to carry over.
   --------------------------------------------------------------------------- */
const satoshi = localFont({
  src: "../public/fonts/satoshi-var.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
  variable: "--font-satoshi",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ambitt.agency"),
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
    url: "https://www.ambitt.agency",
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
    <html lang="en" className={satoshi.variable}>
      <body>{children}</body>
    </html>
  );
}
