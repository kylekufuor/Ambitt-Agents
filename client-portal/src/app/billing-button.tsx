"use client";

import { useState } from "react";

/**
 * Opens the Stripe Customer Portal in the same tab. Sits inside the
 * "Monthly retainer" card on the portal home — uses the system's
 * secondary button style to stay subordinate to the headline number.
 */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through to re-enable button
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="btn-secondary w-full justify-center"
    >
      {loading ? (
        <>
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[color:var(--text-3)] border-t-transparent animate-spin" />
          Opening…
        </>
      ) : (
        <>
          Manage billing
          <span aria-hidden className="text-[color:var(--text-4)]">→</span>
        </>
      )}
    </button>
  );
}
