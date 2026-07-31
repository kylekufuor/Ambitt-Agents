import { redirect } from "next/navigation";
import { verifyAgentOwnership } from "@/lib/agent-auth";

/**
 * The tools page lives at /agent/tools now, in the v3 shell.
 *
 * This route stays because the old path is in clients' inboxes and browser
 * histories. It keeps its ownership check — so an unauthorised id still 404s
 * here rather than being bounced somewhere that leaks whether it exists — and
 * carries the agent id across, so a link for one agent never opens another.
 */
export default async function LegacyAgentToolsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    redirect("/");
  }

  // Carry the query across. An OAuth callback lands here with ?connected=gmail,
  // and dropping it would silently lose the one signal the page has that the
  // connection actually completed.
  const sp = await searchParams;
  const out = new URLSearchParams({ a: id });
  for (const [k, v] of Object.entries(sp)) {
    if (k === "a" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) out.append(k, one);
  }
  redirect(`/agent/tools?${out.toString()}`);
}
