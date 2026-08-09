"use client";

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  // Ticked by default: this is a single-operator admin tool on Kyle's own
  // machines, and typing a fresh code every visit was the actual complaint.
  const [remember, setRemember] = useState(true);
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

    // Built HERE, with the checkbox known, because cookie lifetime is fixed
    // when the client is constructed — this is the write that decides whether
    // this machine has to do the code dance again tomorrow.
    const supabase = createClient({ rememberDevice: remember });
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
    <div className="min-h-screen bg-[#121e23] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-[#fffdfb] flex items-center justify-center mx-auto mb-4">
            <span className="text-black font-semibold text-lg">A</span>
          </div>
          <h1 className="text-xl font-medium text-white">Ambitt Dashboard</h1>
          <p className="text-[#93a7ac] text-sm mt-1">Admin access only</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              className="w-full bg-[#1c2e35] border border-white/[0.06] rounded-lg px-4 py-3 text-white placeholder:text-[#8a9ba1] focus:outline-none focus:border-white/[0.12] transition"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#e7ecec] text-[#16242a] font-medium rounded-lg px-4 py-3 hover:bg-[#fffdfb] transition disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Login Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="bg-[#1c2e35] border border-white/[0.06] rounded-lg p-4 text-center">
              <p className="text-[#93a7ac] text-sm">
                Code sent to <span className="text-white font-medium">{email}</span>
              </p>
            </div>
            {/* Length is NOT pinned to six.
                Supabase issues whatever its project setting says, and this
                project issues eight. The field capped input at six, so an
                eight-digit code was silently truncated to its first six digits
                and then rejected as "Token has expired or is invalid" — a
                message describing a completely different failure, which is why
                it read as a broken login rather than a clipped field.
                Accepts 6-10 and only gates submission on a plausible minimum,
                so changing the setting in Supabase can never break this again. */}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter the code"
              required
              maxLength={10}
              className="w-full bg-[#1c2e35] border border-white/[0.06] rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.4em] font-mono placeholder:text-[#8a9ba1] placeholder:text-base placeholder:tracking-normal focus:outline-none focus:border-white/[0.12] transition"
            />

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 cursor-pointer accent-[#0f7c78]"
              />
              <span className="text-[#93a7ac] text-sm">
                Remember this computer for 90 days
              </span>
            </label>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length < 6}
              className="w-full bg-[#e7ecec] text-[#16242a] font-medium rounded-lg px-4 py-3 hover:bg-[#fffdfb] transition disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setToken(""); setError(""); }}
              className="w-full text-[#93a7ac] text-sm hover:text-[#e7ecec] transition"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
