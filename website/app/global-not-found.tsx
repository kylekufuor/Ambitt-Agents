import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { BrandLockup } from "./(editorial)/_components/brand-mark";
import "./(editorial)/editorial.css";
import "./(editorial)/support.css";

const satoshi = localFont({
  src: "../public/fonts/satoshi-var.woff2",
  weight: "300 900",
  style: "normal",
  display: "swap",
  variable: "--font-satoshi",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Page not found: Ambitt Agents",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={satoshi.variable}>
      <body>
        <main className="not-found-page">
          <div><BrandLockup href="/" /></div>
          <p className="kicker">404 / A missing page</p>
          <h1 className="h1">Let&rsquo;s get you back to the work.</h1>
          <p className="dek">This link may have moved. The homepage, portal and help guide are still here.</p>
          <div className="support-actions">
            <Link href="/" className="btn btn-primary">Go home</Link>
            <Link href="/docs" className="btn btn-ghost">Find help</Link>
            <a href="https://portal.ambitt.agency" className="btn btn-ghost">Open portal</a>
          </div>
        </main>
      </body>
    </html>
  );
}
