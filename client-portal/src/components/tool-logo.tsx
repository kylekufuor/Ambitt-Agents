"use client";

import { useState } from "react";

/* ---------------------------------------------------------------------------
   A tool's own logo, wherever we name a tool.

   Three sources, in order of how official they are:

     1. logoUrl   what Composio publishes for the app. The real mark.
     2. siteUrl   the site's own favicon, fetched through /api/logo so the
                  client's browser never announces to a third party which
                  tools they pay for.
     3. initial   a letter, only when we genuinely have neither.

   The fallback is a state change rather than hiding the <img>. The previous
   version set display:none on error, which left a 36px hole in the row and
   made a broken logo look like a broken page.
   --------------------------------------------------------------------------- */

/** "https://www.costar.com/x" -> "costar.com". Mirrors the server-side check. */
function hostOf(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const h = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

export function ToolLogo({
  name,
  logoUrl = null,
  siteUrl = null,
  size = 36,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  siteUrl?: string | null;
  size?: number;
  className?: string;
}) {
  // ALWAYS through our own endpoint, never a direct third-party <img>.
  // Oracle hands us absolute logo URLs (Composio's CDN for its apps, Google's
  // favicon service for custom ones); rendering those directly would tell
  // Composio and Google which tools each client pays for, on every page view.
  const host = hostOf(siteUrl);
  const src = logoUrl
    ? `/api/logo?u=${encodeURIComponent(logoUrl)}`
    : host
      ? `/api/logo?d=${encodeURIComponent(host)}`
      : null;
  const [failed, setFailed] = useState(false);

  const box = {
    width: size,
    height: size,
    boxShadow: "inset 0 0 0 1px rgba(27,49,57,0.08), 0 1px 2px rgba(27,49,57,0.08)",
  } as const;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${name} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`rounded-[9px] object-contain bg-[color:var(--surface)] shrink-0 ${className}`}
        style={box}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`rounded-[9px] bg-[color:var(--surface-2)] flex items-center justify-center font-semibold text-[color:var(--text-2)] shrink-0 ${className}`}
      style={{ ...box, fontSize: Math.round(size * 0.39) }}
      role="img"
      aria-label={`${name} logo`}
    >
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </div>
  );
}
