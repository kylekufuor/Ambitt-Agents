import { BrandLockup } from "./brand-mark";

/* ---------------------------------------------------------------------------
   The shell every signed-out page shares.

   It is a split, and the split is not decoration: it is the portal's own
   layout. Once you are in, the product is a dark rail against a light content
   plane. The old login was a white card floating on a light wash — a layout
   that belonged to no product in particular, and the first thing a new client
   ever sees. Now the door looks like the room behind it.

   The form side has NO card. On a two-panel layout the panel already provides
   the structure, and boxing the fields as well is the reflex that makes a
   screen look like a form rather than a front door.
   --------------------------------------------------------------------------- */

export function AuthShell({
  children,
  headline,
  sub,
}: {
  children: React.ReactNode;
  headline: string;
  sub: string;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,44%)_1fr] bg-[color:var(--bg)]">
      {/* ---- the dark side: who we are, and what is behind the door ---- */}
      <aside
        className="relative flex flex-col justify-between px-8 py-9 lg:px-12 lg:py-12 overflow-hidden"
        style={{ background: "#15272e" }}
      >
        {/* Atmosphere, not glassmorphism: one soft teal bloom low-left, so the
            panel has somewhere for the eye to rest and the flat ink does not
            read as a black bar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[30%] -left-[15%] w-[680px] h-[680px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,179,179,0.16), transparent 62%)" }}
        />
        {/* A second, tighter one top-right keeps the corner from going dead. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[22%] -right-[18%] w-[420px] h-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,179,179,0.10), transparent 60%)" }}
        />

        <div className="relative">
          <BrandLockup height={21} onDark />
        </div>

        <div className="relative max-w-[30ch] py-12 lg:py-0">
          <h2
            className="text-[26px] lg:text-[32px] leading-[1.15] tracking-[-0.015em]"
            style={{ color: "#fffdfb", fontWeight: 580 }}
          >
            Your agent has been working.
          </h2>
          <p
            className="text-[15px] leading-relaxed mt-4"
            style={{ color: "rgba(226,236,238,0.72)" }}
          >
            Sign in to see who they found, what they sent in your name, and the
            handful of things waiting on you.
          </p>
        </div>

        <p className="relative text-[12.5px]" style={{ color: "rgba(226,236,238,0.55)" }}>
          Questions?{" "}
          <a
            href="mailto:support@ambitt.agency"
            className="underline underline-offset-2"
            style={{ color: "var(--brand)" }}
          >
            support@ambitt.agency
          </a>
        </p>
      </aside>

      {/* ---- the light side: the actual job ---- */}
      <main className="flex items-center justify-center px-6 py-12 lg:py-0">
        <div className="w-full max-w-[368px]">
          <h1 className="font-display text-[24px] leading-tight tracking-[-0.01em] text-[color:var(--text)]">
            {headline}
          </h1>
          <p className="text-[14px] text-[color:var(--text-3)] mt-1.5 leading-relaxed">{sub}</p>
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
