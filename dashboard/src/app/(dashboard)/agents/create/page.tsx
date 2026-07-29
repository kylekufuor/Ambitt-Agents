import Link from "next/link";
import { oracleUrl } from "@/lib/oracle";
import { CreateAgentForm, type ComposioApp } from "./create-agent-form";

export const dynamic = "force-dynamic";

// A miss here is non-fatal by design: the form falls back to its built-in tool
// list, so an empty result is a degraded page, not a broken action.
async function fetchComposioApps(): Promise<ComposioApp[]> {
  try {
    const res = await fetch(`${oracleUrl()}/composio/apps`, {
      next: { revalidate: 3600 }, // cache for 1 hour
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    // Oracle not running — return empty, form will show fallback
    return [];
  }
}

export default async function CreateAgentPage() {
  const apps = await fetchComposioApps();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">Agents</Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">Create</span>
      </div>

      <div>
        <h1 className="text-2xl font-medium text-foreground">Create Agent</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Set up a new AI agent in under 60 seconds. Connect to {apps.length > 0 ? `${apps.length}+` : "850+"} business tools.
        </p>
      </div>

      <CreateAgentForm composioApps={apps} />
    </div>
  );
}
