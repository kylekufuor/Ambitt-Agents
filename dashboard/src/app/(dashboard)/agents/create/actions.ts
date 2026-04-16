"use server";

import { redirect } from "next/navigation";

const oracleUrl =
  process.env.ORACLE_URL ?? "https://ambitt-agents-production.up.railway.app";

// ---------------------------------------------------------------------------
// Test a credential against an MCP server
// ---------------------------------------------------------------------------

export interface TestCredentialState {
  success: boolean | null;
  toolCount: number;
  error: string | null;
}

export async function testCredentialAction(
  _prevState: TestCredentialState,
  formData: FormData
): Promise<TestCredentialState> {
  const serverId = formData.get("serverId") as string;
  const credential = formData.get("credential") as string;

  if (!serverId || !credential) {
    return { success: false, toolCount: 0, error: "Missing server ID or credential" };
  }

  try {
    const res = await fetch(`${oracleUrl}/tools/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, credential }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Connection failed" }));
      return { success: false, toolCount: 0, error: body.error ?? `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, toolCount: data.toolCount ?? 0, error: null };
  } catch (error) {
    return {
      success: false,
      toolCount: 0,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Create agent + store credentials
// ---------------------------------------------------------------------------

export interface CreateAgentState {
  success: boolean | null;
  agentId: string | null;
  error: string | null;
}

export async function createAgentAction(
  _prevState: CreateAgentState,
  formData: FormData
): Promise<CreateAgentState> {
  // Read any SOP files, base64-encode, forward to Oracle in the JSON body.
  // Files arrive as File objects under the "sops" field.
  const sopFiles = formData.getAll("sops").filter((f): f is File => f instanceof File && f.size > 0);
  const sops = await Promise.all(
    sopFiles.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        content: buffer.toString("base64"),
      };
    })
  );

  const payload = {
    clientName: formData.get("clientName") as string,
    preferredName: (formData.get("preferredName") as string) || undefined,
    clientEmail: formData.get("clientEmail") as string,
    businessName: formData.get("businessName") as string,
    businessWebsite: formData.get("businessWebsite") as string || undefined,
    businessDescription: formData.get("businessDescription") as string,
    agent: {
      name: formData.get("agentName") as string,
      agentType: formData.get("agentType") as string,
      tools: JSON.parse(formData.get("tools") as string) as string[],
      purpose: formData.get("businessDescription") as string,
    },
    credentials: JSON.parse(formData.get("credentials") as string) as Array<{
      toolName: string;
      apiKey?: string;
      oauthToken?: string;
    }>,
    sops,
  };

  try {
    // Scaffold the agent
    const res = await fetch(`${oracleUrl}/agents/scaffold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Scaffold failed" }));
      return { success: false, agentId: null, error: body.error ?? `HTTP ${res.status}` };
    }

    const data = await res.json();
    const agentId = data.agentId as string;

    // Redirect to the new agent page
    redirect(`/agents/${agentId}`);
  } catch (error) {
    // redirect() throws a special error — let it propagate
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {
      success: false,
      agentId: null,
      error: error instanceof Error ? error.message : "Failed to create agent",
    };
  }
}
