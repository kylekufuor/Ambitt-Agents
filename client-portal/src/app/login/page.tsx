"use client";

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/brand-mark";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const router = useRouter();

  // Sending the code is a couple of cross-origin round-trips to Supabase (CORS
  // preflight + the POST that emails the code), which can take 2–4s. Waiting on
  // that made the button feel dead, so we advance to the code screen INSTANTLY
  // and send in the background — the code lands in the inbox a moment later.
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setStep("code");
    setSending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      setError(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="page-wash min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* soft brand glow behind the card — atmosphere, not glassmorphism */}
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
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                  Sign in to your workspace
                </h1>
                <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5">
                  Enter your email and we&apos;ll send you a 6-digit code.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
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
                {loading ? "Sending…" : "Send login code"}
              </button>

              <button
                type="button"
                onClick={() => { if (email) setStep("code"); else setError("Enter your email first"); }}
                className="w-full text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition"
              >
                I already have a code
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                  Check your inbox
                </h1>
                <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5">
                  {sending ? "Sending your code to " : "We sent a 6-digit code to "}
                  <span className="text-[color:var(--text)] font-medium">{email}</span>
                  {sending && <span className="inline-block animate-pulse">…</span>}
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="000000"
                autoFocus
                required
                maxLength={8}
                className="field text-center text-[26px] tracking-[0.5em] font-mono"
                style={{ paddingTop: 14, paddingBottom: 14 }}
              />

              {error && <p className="text-[13px] text-[color:var(--red)]">{error}</p>}

              <button type="submit" disabled={loading || token.length < 4} className="btn-primary w-full">
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("email"); setToken(""); setError(""); }}
                className="w-full text-[13px] text-[color:var(--text-3)] hover:text-[color:var(--text)] transition"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[12px] text-[color:var(--text-4)] mt-6">
          Your AI workforce, run by us. Questions?{" "}
          <a href="mailto:support@ambitt.agency" className="text-[color:var(--brand-hover)] hover:underline">
            support@ambitt.agency
          </a>
        </p>
      </div>
    </div>
  );
}
