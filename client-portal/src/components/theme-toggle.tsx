"use client";

import { useEffect, useState } from "react";

/** A local preference only. Storage being unavailable must not block the portal. */
export function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? "dark"); }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="theme-toggle" aria-label={`Switch to ${next} appearance`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try { localStorage.setItem("ambitt-appearance", next); } catch { /* Session preference still applies. */ }
      }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {theme === "dark" ? <>
          <circle cx="12" cy="12" r="4" fill="currentColor" opacity=".22" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </> : <path d="M20 14a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />}
      </svg>
      <span>{next === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
