"use server";

import { revalidatePath } from "next/cache";

// Operator fleet-control actions. Each drives an existing Oracle endpoint with
// OPERATOR authority (pause/resume/kill/config), then revalidates the Agents
// page so the new state shows immediately. Built after the Arthur→Casey
// incident so Kyle has one place to pause, reduce, or stop any client's agent.

function oracle(): string {
  return process.env.ORACLE_URL ?? "https://oracle-production-c0ff.up.railway.app";
}

async function post(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${oracle()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Oracle ${path} → ${res.status} ${txt.slice(0, 160)}`);
  }
}

async function patch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${oracle()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Oracle ${path} → ${res.status} ${txt.slice(0, 160)}`);
  }
}

export async function pauseAgentAction(formData: FormData): Promise<void> {
  const id = formData.get("agentId") as string;
  await post(`/agents/${id}/pause`, { reason: "Paused by operator from the dashboard" });
  revalidatePath("/agents");
}

export async function resumeAgentAction(formData: FormData): Promise<void> {
  const id = formData.get("agentId") as string;
  await post(`/agents/${id}/resume`);
  revalidatePath("/agents");
}

export async function killAgentAction(formData: FormData): Promise<void> {
  const id = formData.get("agentId") as string;
  await post(`/agents/${id}/kill`);
  revalidatePath("/agents");
}

export async function setCadenceAction(formData: FormData): Promise<void> {
  const id = formData.get("agentId") as string;
  const emailFrequency = formData.get("emailFrequency") as string;
  await patch(`/agents/${id}/config`, { emailFrequency });
  revalidatePath("/agents");
}

export async function setSensitivityAction(formData: FormData): Promise<void> {
  const id = formData.get("agentId") as string;
  const safetySensitivity = formData.get("safetySensitivity") as string;
  await patch(`/agents/${id}/config`, { safetySensitivity });
  revalidatePath("/agents");
}

export async function pauseAllAction(_formData: FormData): Promise<void> {
  await post(`/agents/pause-all`);
  revalidatePath("/agents");
}
