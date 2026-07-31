"use client";

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

/* ---------------------------------------------------------------------------
   Sign in with an email and a password.

   This replaced a 6-digit emailed code. The code was arguably more secure in
   the narrow sense — nothing to reuse, nothing to leak — but it put an inbox
   round-trip between a client and their own leads every single time, and that
   friction was being paid daily by people who only want to check on their
   agent.

   No client has a password yet, so "Set or reset" below is BOTH the first-time
   setup and the recovery path. It is the same Supabase recovery email either
   way, which means nobody here ever handles a client's password: they choose
   it themselves and we only ever see the resulting session.
   --------------------------------------------------------------------------- */

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when sign-in fails in the one way that is usually "no password yet"
  // rather than "typo". Drives the offer below instead of a dead end.
  const [offerSetup, setOfferSetup] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Built HERE, with the checkbox already known, because the cookie lifetime
    // is fixed when the client is constructed.
    const supabase = createClient({ rememberDevice: remember });
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase returns "Invalid login credentials" both for a wrong password
      // and for an account that has none set — it cannot tell us which, and
      // deliberately so. Every client who has not been through the setup link
      // lands here, so the failure has to carry the fix with it rather than
      // pointing at a link further down that reads like it is for people who
      // forgot something.
      const looksLikeNoPassword = /invalid login credentials/i.test(error.message);
      setOfferSetup(looksLikeNoPassword);
      setError(
        looksLikeNoPassword
          ? "That did not match. If this is your first time here, you have not chosen a password yet."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  /**
   * Send the set-password link without making them retype the address.
   *
   * Deliberately says the same thing whether or not the address is one of
   * ours — otherwise this becomes a way to test which businesses are clients.
   */
  async function handleSendSetupLink() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/new-password`,
    });
    if (error && /rate|too many/i.test(error.message)) {
      setError("Too many attempts just now. Give it a minute and try again.");
      setLoading(false);
      return;
    }
    setLinkSent(true);
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
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                Sign in to your workspace
              </h1>
              <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5">
                Your email and password.
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
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

            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="field"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 accent-[color:var(--brand-solid)] cursor-pointer"
              />
              <span className="text-[13.5px] text-[color:var(--text-2)]">Remember this device</span>
            </label>

            {error && <p className="text-[13px] text-[color:var(--red)] leading-relaxed">{error}</p>}

            {linkSent ? (
              <p className="text-[13px] text-[color:var(--text-2)] leading-relaxed">
                Sent. If <span className="text-[color:var(--text)] font-medium">{email}</span> is on
                an account with us, there is now a link in that inbox to choose a password. It is
                good for one hour.
              </p>
            ) : offerSetup ? (
              <button
                type="button"
                onClick={handleSendSetupLink}
                disabled={loading || !email}
                className="btn-secondary w-full"
              >
                {loading ? "Sending…" : "Email me a link to set my password"}
              </button>
            ) : null}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-[13px] text-[color:var(--text-3)]">
              <Link href="/login/reset" className="text-[color:var(--brand-ink)] hover:underline">
                Set or reset your password
              </Link>
            </p>
          </form>
        </div>

        <p className="text-center text-[12.5px] text-[color:var(--text-3)] mt-5 leading-relaxed">
          On a shared computer? Untick &ldquo;remember this device&rdquo; and we will sign you out
          when the browser closes.
        </p>

        <p className="text-center text-[12px] text-[color:var(--text-3)] mt-4">
          Questions?{" "}
          <a href="mailto:support@ambitt.agency" className="text-[color:var(--brand-ink)] underline underline-offset-2">
            support@ambitt.agency
          </a>
        </p>
      </div>
    </div>
  );
}
