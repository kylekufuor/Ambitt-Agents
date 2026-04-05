import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative section-glow pt-16 pb-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Top row */}
        <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
          <div>
            <p className="text-2xl font-bold tracking-tight">
              <span className="text-accent">A</span>
              <span className="text-foreground/90">mbitt</span>
            </p>
            <p className="text-muted-foreground text-sm mt-2 max-w-xs leading-relaxed">
              AI agents that work like your best employee. No dashboards. No logins. Just results in your inbox.
            </p>
          </div>

          <div className="flex gap-16">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground/60 mb-4">Product</p>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <Link href="/#features" className="hover:text-foreground transition-colors duration-300">Features</Link>
                <Link href="/#pricing" className="hover:text-foreground transition-colors duration-300">Pricing</Link>
                <Link href="/#how-it-works" className="hover:text-foreground transition-colors duration-300">How It Works</Link>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground/60 mb-4">Company</p>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <Link href="/contact" className="hover:text-foreground transition-colors duration-300">Contact</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors duration-300">Privacy</Link>
                <a href="mailto:support@ambitt.agency" className="hover:text-foreground transition-colors duration-300">Support</a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="border-t border-white/[0.04] pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground/40 text-xs">
            &copy; {new Date().getFullYear()} Ambitt Agents. All rights reserved.
          </p>
          <p className="text-muted-foreground/30 text-[11px]">
            Built with purpose. Powered by Claude.
          </p>
        </div>
      </div>
    </footer>
  );
}
