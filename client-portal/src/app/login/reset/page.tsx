"use client";

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

/* ---------------------------------------------------------------------------
   Set or reset a password.

   One page for both, because for every existing client they are the same
   thing: nobody has a password yet, so their "reset" IS their first setup.
   Splitting them would have meant explaining a distinction the client does not
   have.

   The response is deliberately identical whether or not the address is one of
   ours. Saying "no account with that email" would turn this into a way to test
   which businesses are our clients.
   --------------------------------------------------------------------------- */

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // window.location.origin is the browser's own address bar, so it is the
      // real public origin — the Railway proxy problem only affects URLs built
      // on the server from req.url.
      redirectTo: `${window.location.origin}/login/new-password`,
    });

    // Rate limiting is the one thing worth surfacing; everything else is
    // swallowed so the page cannot be used to enumerate our client list.
    if (error && /rate|too many/i.test(error.message)) {
      setError("Too many attempts just now. Give it a minute and try again.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="page-wash min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[62%] w-[520px] h-[520px] rounded-full opacity-70"
        style={{ background: "radial-gradient(circle, rgba(0,164,189,0.10), transparent 62%)" }}
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex justify-center mb-7">
          <BrandLockup height={26} />
        </div>

        <div className="card p-7 sm:p-8">
          {sent ? (
            <div className="space-y-4">
              <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                Check your inbox
              </h1>
              <p className="text-[13.5px] text-[color:var(--text-2)] leading-relaxed">
                If <span className="text-[color:var(--text)] font-medium">{email}</span> is on an
                account with us, there is now a link in it that lets you choose a password. It is
                good for one hour.
              </p>
              <p className="text-[13px] text-[color:var(--text-3)] leading-relaxed">
                Nothing in your inbox after a couple of minutes? Check spam, then write to
                support@ambitt.agency and we will sort it.
              </p>
              <Link href="/login" className="btn-secondary w-full inline-flex justify-center no-underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                  Set your password
                </h1>
                <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5 leading-relaxed">
                  New here, or forgotten it? Either way, we will email you a link to choose one.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  autoFocus
                  required
                  className="field"
                />
              </div>

              {error && <p className="text-[13px] text-[color:var(--red)]">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending…" : "Email me a link"}
              </button>

              <p className="text-center text-[13px] text-[color:var(--text-3)]">
                <Link href="/login" className="text-[color:var(--brand-ink)] hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
