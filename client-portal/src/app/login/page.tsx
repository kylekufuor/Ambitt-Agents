"use client";

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Ambitt</h1>
          <p className="text-zinc-500 text-sm mt-1">Client portal</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              required
              className="w-full border border-zinc-300 rounded-lg px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500 transition"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 text-white font-medium rounded-lg px-4 py-3 hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Login Code"}
            </button>
            <button
              type="button"
              onClick={() => { if (email) setStep("code"); else setError("Enter your email first"); }}
              className="w-full text-zinc-500 text-sm hover:text-zinc-700 transition"
            >
              I already have a code
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-center">
              <p className="text-zinc-500 text-sm">
                {sending ? "Sending your code to " : "Code sent to "}
                <span className="text-zinc-900 font-medium">{email}</span>
                {sending && <span className="inline-block animate-pulse">…</span>}
              </p>
              {sending && (
                <p className="text-zinc-400 text-xs mt-1">
                  It arrives in a few seconds — enter it below when it lands.
                </p>
              )}
            </div>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter code"
              required
              maxLength={8}
              className="w-full border border-zinc-300 rounded-lg px-4 py-3 text-zinc-900 text-center text-2xl tracking-[0.5em] font-mono placeholder:text-zinc-400 placeholder:text-base placeholder:tracking-normal focus:outline-none focus:border-zinc-500 transition"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length < 4}
              className="w-full bg-zinc-900 text-white font-medium rounded-lg px-4 py-3 hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setToken(""); setError(""); }}
              className="w-full text-zinc-500 text-sm hover:text-zinc-700 transition"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
