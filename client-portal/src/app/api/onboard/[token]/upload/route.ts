import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/db";

/**
 * SOP file upload — extracts text and returns it immediately. We do NOT
 * persist the file anywhere; the extracted text is sent back to the
 * client, the client holds it in state, and it gets bundled into the
 * Prospect's formData.sopFiles array on submit. This keeps storage
 * complexity at zero for v1.
 *
 * Supported types: .pdf, .doc/.docx, .md, .txt, .rtf.
 */
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/onboard/[token]/upload">
) {
  const { token } = await ctx.params;

  const prospect = await prisma.prospect.findUnique({ where: { token }, select: { id: true, status: true } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prospect.status === "archived" || prospect.status === "ghosted") {
    return NextResponse.json({ error: "Onboarding closed" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }

  const filename = file.name || "upload";
  const lower = filename.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let extractedText = "";
  try {
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      const mod = await import("pdf-parse");
      const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
      const out = await pdfParse(buffer);
      extractedText = out.text ?? "";
    } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const out = await mammoth.extractRawText({ buffer });
      extractedText = out.value ?? "";
    } else if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".rtf") || file.type.startsWith("text/")) {
      extractedText = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: `Unsupported file type: ${filename}` }, { status: 415 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Couldn't read ${filename}: ${err instanceof Error ? err.message : "parse error"}` }, { status: 422 });
  }

  return NextResponse.json({
    id: crypto.randomUUID(),
    filename,
    sizeBytes: file.size,
    contentType: file.type || "application/octet-stream",
    extractedText: extractedText.trim(),
  });
}
