"use client";

import { useState } from "react";

export function BillingPortalButton({ hasBillingAccount }: { hasBillingAccount: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function openBilling() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/portal", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error("unavailable");
      // The server provides the URL directly from Stripe, never from user input.
      window.location.assign(data.url);
    } catch {
      setError("We couldn't open billing just now. Try again, or email support@ambitt.agency.");
      setLoading(false);
    }
  }
  if (!hasBillingAccount) return <p className="text-[13px] text-[color:var(--text-2)]">Your billing account is not connected yet. <a href="mailto:support@ambitt.agency" className="underline text-[color:var(--brand-ink)]">Contact support</a> to get it set up.</p>;
  return <>
    <button type="button" className="btn btn-primary" disabled={loading} onClick={openBilling}>{loading ? "Opening Stripe…" : "Manage card and invoices"}</button>
    {error && <p role="alert" className="text-[13px] text-[color:var(--red)] mt-2">{error}</p>}
  </>;
}
