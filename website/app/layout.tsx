import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted, no CDN. woff2 extracted from the approved mockup into public/fonts.
const lexend = localFont({
  src: "../public/fonts/lexend.woff2",
  weight: "400 700",
  display: "swap",
  variable: "--font-lexend",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const bricolage = localFont({
  src: "../public/fonts/bricolage-grotesque.woff2",
  weight: "600 800",
  display: "swap",
  variable: "--font-bricolage",
  fallback: ["Lexend", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ambitt.agency"),
  title: "Ambitt Agents — named AI agents that do the work in your tools",
  description:
    "Hire a named AI agent that works inside the tools you already use and emails you the finished work. You ask in plain English. It does the job. You never touch a dashboard.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/ambitt-agents-favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Ambitt Agents — named AI agents that do the work in your tools",
    description:
      "You ask in plain English. It does the job inside the tools you already use, and emails you the finished work. You never touch a dashboard.",
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
    <html lang="en" className={`${lexend.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
