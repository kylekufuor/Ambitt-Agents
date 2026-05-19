import { NextResponse } from "next/server";

function oracleUrl(): string {
  return process.env.ORACLE_URL
    ?? process.env.NEXT_PUBLIC_ORACLE_URL
    ?? "https://oracle-production-c0ff.up.railway.app";
}

/**
 * Composio app catalog proxy — public, no auth. Used by the onboarding
 * tool picker to populate typeahead suggestions. The Oracle endpoint
 * caches the upstream Composio response for 12h, so this proxy is cheap
 * to hammer.
 */
export async function GET() {
  try {
    const res = await fetch(`${oracleUrl()}/composio/catalog`, { cache: "no-store" });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { items: [], error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    );
  }
}
