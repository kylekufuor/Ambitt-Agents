"use client";

import { createClient } from "@/lib/supabase-browser";
import { nextFromLocation } from "@/lib/safe-next";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";

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
  const [busy, setBusy] = useState<"sign-in" | "reset" | null>(null);
  const loading = busy !== null;
  const emailField = useRef<HTMLInputElement>(null);
  const [linkSent, setLinkSent] = useState(false);
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("sign-in");
    setError("");
    try {
      const supabase = createClient({ rememberDevice: remember });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(/invalid login credentials/i.test(error.message)
          ? "That did not match. If you have not chosen a password yet, use the button below."
          : "We couldn't sign you in just now. Please try again.");
        return;
      }
      router.push(nextFromLocation());
      router.refresh();
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSendSetupLink() {
    if (!emailField.current?.reportValidity()) return;
    setBusy("reset");
    setError("");
    try {
      const next = nextFromLocation();
      const back = new URL("/login/new-password", window.location.origin);
      if (next !== "/") back.searchParams.set("next", next);
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: back.toString() });
      if (error) {
        setError(/rate|too many/i.test(error.message)
          ? "Too many attempts just now. Give it a minute and try again."
          : "We couldn't send the link just now. Please try again.");
        return;
      }
      setLinkSent(true);
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthShell headline="Welcome back." sub="Sign in to your workspace with your email and password.">
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                ref={emailField}
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLinkSent(false); setError(""); }}
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

            {error && <p role="alert" className="text-[13px] text-[color:var(--red)] leading-relaxed">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {busy === "sign-in" ? "Signing in…" : "Sign in"}
            </button>

            {/* The first-time path, visible from the start rather than waiting
                for a failure. Every client arrives here without a password, so
                making them guess wrong first — then reading an error — is the
                wrong order. It is a labelled section, not a link tucked under
                the button, because "set or reset your password" reads as being
                for people who forgot one. */}
            <div className="pt-1 border-t border-[color:var(--border)]">
              {linkSent ? (
                <p role="status" className="text-[13px] text-[color:var(--text-2)] leading-relaxed pt-4">
                  Sent. If <span className="text-[color:var(--text)] font-medium">{email}</span> is
                  on an account with us, there is now a link in that inbox to choose a password. It
                  is good for one hour.
                </p>
              ) : (
                <div className="pt-4 space-y-2.5">
                  <p className="text-[13px] text-[color:var(--text-3)] leading-relaxed">
                    First time here, or never chosen a password? We will email you a link to set
                    one.
                  </p>
                  <button
                    type="button"
                    onClick={handleSendSetupLink}
                    disabled={loading || !email}
                    className="btn-secondary w-full"
                  >
                    {busy === "reset" ? "Sending…" : "Email me a link to set my password"}
                  </button>
                  {!email && (
                    <p className="text-[12.5px] text-[color:var(--text-3)]">
                      Put your email in above first.
                    </p>
                  )}
                </div>
              )}
            </div>
          </form>

        <p className="text-center text-[12.5px] text-[color:var(--text-3)] mt-5 leading-relaxed">
          On a shared computer? Untick &ldquo;remember this device&rdquo; and we will sign you out
          when the browser closes.
        </p>

    </AuthShell>
  );
}
