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
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-center">
              <p className="text-zinc-500 text-sm">
                Code sent to <span className="text-zinc-900 font-medium">{email}</span>
              </p>
            </div>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              maxLength={6}
              className="w-full border border-zinc-300 rounded-lg px-4 py-3 text-zinc-900 text-center text-2xl tracking-[0.5em] font-mono placeholder:text-zinc-400 placeholder:text-base placeholder:tracking-normal focus:outline-none focus:border-zinc-500 transition"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length < 6}
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
