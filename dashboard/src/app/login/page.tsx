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
  const router = useRouter();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setStep("code");
    }
    setLoading(false);
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
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mx-auto mb-4">
            <span className="text-black font-bold text-lg">A</span>
          </div>
          <h1 className="text-xl font-bold text-white">Ambitt Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Admin access only</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              className="w-full bg-[#111113] border border-white/[0.06] rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.12] transition"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-medium rounded-lg px-4 py-3 hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Login Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="bg-[#111113] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-zinc-400 text-sm">
                Code sent to <span className="text-white font-medium">{email}</span>
              </p>
            </div>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              maxLength={6}
              className="w-full bg-[#111113] border border-white/[0.06] rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-zinc-600 placeholder:text-base placeholder:tracking-normal focus:outline-none focus:border-white/[0.12] transition"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length < 6}
              className="w-full bg-white text-black font-medium rounded-lg px-4 py-3 hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setToken(""); setError(""); }}
              className="w-full text-zinc-500 text-sm hover:text-zinc-300 transition"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
