"use client";

import { createClient } from "@/lib/supabase-browser";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

/* ---------------------------------------------------------------------------
   Choose a password, landed on from the emailed recovery link.

   Supabase puts the client in a temporary recovery session when they arrive,
   which is what lets updateUser() work without knowing the old password. If
   that session is missing the link was stale or already used, and the page has
   to say so rather than failing on submit after they have typed twice.
   --------------------------------------------------------------------------- */

const MIN = 10;

export default function NewPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    // Supabase parses the recovery token out of the URL on load, so give it a
    // beat before deciding the link was bad.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady("ok");
    });
    supabase.auth.getSession().then(({ data }) => {
      setReady((prev) => (data.session ? "ok" : prev === "ok" ? "ok" : "expired"));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN) {
      setError(`Use at least ${MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two do not match.");
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
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
          {ready === "expired" ? (
            <div className="space-y-4">
              <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                That link has expired
              </h1>
              <p className="text-[13.5px] text-[color:var(--text-2)] leading-relaxed">
                Password links are good for an hour and can only be used once. Ask for a fresh one
                and it will be in your inbox in a moment.
              </p>
              <Link href="/login/reset" className="btn-primary w-full inline-flex justify-center no-underline">
                Send me a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <h1 className="font-display text-[20px] text-[color:var(--text)] leading-tight">
                  Choose a password
                </h1>
                <p className="text-[13.5px] text-[color:var(--text-3)] mt-1.5">
                  At least {MIN} characters. Nobody here can see it.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  className="field"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="confirm">Again, to be sure</label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="field"
                />
              </div>

              {error && <p className="text-[13px] text-[color:var(--red)]">{error}</p>}

              <button
                type="submit"
                disabled={loading || ready !== "ok"}
                className="btn-primary w-full"
              >
                {ready === "checking" ? "One moment…" : loading ? "Saving…" : "Save and sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
