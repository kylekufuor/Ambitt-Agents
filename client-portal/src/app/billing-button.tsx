"use client";

import { useState } from "react";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/billing", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-block bg-zinc-900 text-white font-medium rounded-lg px-5 py-2.5 text-sm hover:bg-zinc-800 transition disabled:opacity-50"
    >
      {loading ? "Loading..." : "Manage Billing"}
    </button>
  );
}
