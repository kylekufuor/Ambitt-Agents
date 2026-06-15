import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

// Body — Geist Sans. Characterful neutral grotesque, ships with Vercel's
// design system. Chosen over Inter for distinctiveness; the brand identity
// document points to "distinctive display + refined body" pairing.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Display — Fraunces. Variable serif from Google Fonts with optical-size,
// SOFT, and WONK axes. Gives the warm-minimal Ambitt aesthetic real
// editorial character. Used on hero headers + section titles.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
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
      // Browser extensions (1Password, Grammarly, adblockers) inject inline
      // styles onto <html> before React hydrates — `suppressHydrationWarning`
      // silences the resulting top-level mismatch without hiding real bugs
      // deeper in the tree (React only suppresses one level).
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
