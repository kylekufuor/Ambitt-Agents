import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyAgentOwnership } from "@/lib/agent-auth";

/** RFC-4180-ish CSV cell escaping. */
function cell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await verifyAgentOwnership(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const leads = await prisma.lead.findMany({
    where: { agentId: id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      name: true,
      company: true,
      email: true,
      phone: true,
      status: true,
      source: true,
      valueUsd: true,
      notes: true,
      details: true,
      lastContactedAt: true,
      createdAt: true,
    },
  });

  const headers = [
    "Name",
    "Company",
    "Email",
    "Phone",
    "Status",
    "Value (USD)",
    "Source",
    "Notes",
    "Details",
    "Last contacted",
    "Added",
  ];

  const lines = [headers.join(",")];
  for (const l of leads) {
    lines.push(
      [
        l.name,
        l.company,
        l.email,
        l.phone,
        l.status,
        l.valueUsd,
        l.source,
        l.notes,
        l.details ? JSON.stringify(l.details) : "",
        l.lastContactedAt ? l.lastContactedAt.toISOString().slice(0, 10) : "",
        l.createdAt.toISOString().slice(0, 10),
      ]
        .map(cell)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
