import { requirePortalContext } from "@/lib/portal-context";
import { V3Shell } from "@/components/v3-shell";
import {
  Workspace,
  type WorkspaceMode,
  type WorkspaceState,
} from "./workspace";
import { oracleUrl } from "@/lib/agent-auth";
import { signWorkspaceRequest } from "@/lib/workspace-auth";
import { Suspense } from "react";

export async function WorkspacePage({
  mode = "home",
}: {
  mode?: WorkspaceMode;
}) {
  const { email, client, agent } = await requirePortalContext();
  let initial: WorkspaceState | undefined;
  if (agent) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const path = "/workspace/state";
        const res = await fetch(`${oracleUrl()}${path}`, {
          headers: {
            Authorization: `Bearer ${signWorkspaceRequest(client.id, agent.id, "GET", path, "")}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          initial = await res.json();
          break;
        }
        if (res.status < 500) break;
      } catch {
        /* The client can retry without losing the rest of the portal. */
      }
    }
  }
  return (
    <V3Shell
      user={{ email, name: client.businessName }}
      crumbs={[
        {
          label:
            mode === "home"
              ? "Workspace"
              : mode === "chat"
                ? "Chat"
                : mode === "playbook"
                  ? "Playbook"
                  : "Files",
        },
      ]}
    >
      {agent ? (
        <Suspense>
          <Workspace
            agentId={agent.id}
            agentName={agent.name}
            agentStatus={agent.status}
            mode={mode}
            initial={initial}
          />
        </Suspense>
      ) : (
        <div className="ws-browser-empty">
          <h1>Your workspace is being set up.</h1>
          <p>Your tools and agent will appear here once setup is complete.</p>
        </div>
      )}
    </V3Shell>
  );
}
