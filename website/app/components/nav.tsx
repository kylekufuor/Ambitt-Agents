import Link from "next/link";

export function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-6xl px-6 pt-4">
        <div className="flex items-center justify-between h-14 px-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span className="text-accent">A</span>
            <span className="text-foreground/90">mbitt</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-[13px] text-muted-foreground">
            <Link href="/#features" className="hover:text-foreground transition-colors duration-300">Features</Link>
            <Link href="/#how-it-works" className="hover:text-foreground transition-colors duration-300">How It Works</Link>
            <Link href="/#pricing" className="hover:text-foreground transition-colors duration-300">Pricing</Link>
            <Link href="/#faq" className="hover:text-foreground transition-colors duration-300">FAQ</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors duration-300">Contact</Link>
          </nav>
          <Link
            href="/#pricing"
            className="bg-accent/90 hover:bg-accent text-background text-[13px] font-semibold px-5 py-2 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)]"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
