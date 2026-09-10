import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./(site)/globals.css";

/* ---------------------------------------------------------------------------
   The 404 for any URL no route matches. The app has two root layouts, the
   editorial pages and the rest of the site, so there is no single layout for
   a stray URL to fall back to; without this file Next serves a bare,
   unstyled page. It wears the rest of the site's styles and the same Satoshi
   file (see app/(site)/layout.tsx for the licence notes).
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
  title: "Page not found — Ambitt Agents",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={satoshi.variable}>
      <body>
        {/* Spacing by gap, not margin utilities: the site stylesheet's unlayered
            resets (* and p set margin: 0, a sets colour) outrank Tailwind's layer. */}
        <main className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center flex flex-col items-center gap-4">
            <p className="label-pill">404</p>
            <h1 className="text-4xl font-medium tracking-tight">This page could not be found.</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">The link may be old, or the address may have a typo.</p>
            <Link href="/" style={{ color: "var(--link)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "4px", marginTop: "8px" }}>
              Go to the homepage
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
