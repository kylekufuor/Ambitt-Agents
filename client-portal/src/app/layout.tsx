import type { Metadata } from "next";
import { Geist_Mono, Lexend } from "next/font/google";
import "./globals.css";

// Lexend — HubSpot's brand typeface. Clean geometric-humanist sans used for
// BOTH display and body: one family, semibold headings, functional feel. This
// is the core of the HubSpot-style product look (no serif display).
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${lexend.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
