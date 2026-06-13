import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Inbound Attachment Parser
// ---------------------------------------------------------------------------
// Extracts text content from email attachments sent by clients.
// Supports: PDF, DOCX, plain text, CSV, JSON, markdown.
// Returns structured content that can be appended to the user message
// or stored in agent memory.
// ---------------------------------------------------------------------------

export interface InboundAttachment {
  filename: string;
  contentType: string;
  content: string; // base64-encoded from Resend
}

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
}

// Max text per attachment — prevent blowing up the context window
const MAX_TEXT_LENGTH = 50_000;

/**
 * Parse all attachments from a Resend inbound email payload.
 * Returns extracted text content for each attachment.
 */
export async function parseInboundAttachments(
  attachments: InboundAttachment[]
): Promise<ParsedAttachment[]> {
  const results: ParsedAttachment[] = [];

  for (const attachment of attachments) {
    try {
      const parsed = await parseSingle(attachment);
      if (parsed.text.length > 0) {
        results.push(parsed);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Failed to parse attachment", {
        filename: attachment.filename,
        contentType: attachment.contentType,
        error: message,
      });
      results.push({
        filename: attachment.filename,
        contentType: attachment.contentType,
        text: `[Could not parse this file: ${message}]`,
        sizeBytes: Buffer.from(attachment.content, "base64").length,
        truncated: false,
      });
    }
  }

  return results;
}

/**
 * Format parsed attachments as context to append to the user message.
 */
export function formatAttachmentsAsContext(parsed: ParsedAttachment[]): string {
  if (parsed.length === 0) return "";

  const sections = parsed.map((a) => {
    const truncNote = a.truncated ? " (truncated)" : "";
    return `--- Attachment: ${a.filename}${truncNote} ---\n${a.text}`;
  });

  return `\n\nThe client attached the following documents:\n\n${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Individual parsers by content type
// ---------------------------------------------------------------------------

async function parseSingle(attachment: InboundAttachment): Promise<ParsedAttachment> {
  const buffer = Buffer.from(attachment.content, "base64");
  const sizeBytes = buffer.length;
  const ct = attachment.contentType.toLowerCase();
  const ext = attachment.filename.toLowerCase().split(".").pop() ?? "";

  let text: string;

  if (ct === "application/pdf" || ext === "pdf") {
    text = await parsePDF(buffer);
  } else if (
    ct === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    text = await parseDOCX(buffer);
  } else if (
    ct === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === "xlsx"
  ) {
    // Spreadsheet exports (CoStar / Crexi / any tool's "export to Excel").
    // Rendered to CSV-per-sheet text so the agent reads it like tabular data.
    text = await parseXLSX(buffer);
  } else if (ct.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    text = buffer.toString("utf-8");
  } else if (ct === "application/json" || ext === "json") {
    text = buffer.toString("utf-8");
  } else {
    text = `[Unsupported file type: ${ct}]`;
  }

  const truncated = text.length > MAX_TEXT_LENGTH;
  if (truncated) {
    text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... content truncated at 50,000 characters]";
  }

  return {
    filename: attachment.filename,
    contentType: attachment.contentType,
    text,
    sizeBytes,
    truncated,
  };
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "tsv", "html", "htm", "xml", "yaml", "yml",
  "log", "ini", "cfg", "conf", "sh", "bash", "py", "js", "ts",
  "jsx", "tsx", "sql", "r", "rb", "go", "rs", "java", "c", "cpp",
  "h", "css", "scss", "less", "env", "toml",
]);

async function parsePDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function parseDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

// Render an .xlsx workbook to CSV text, one block per sheet. Tool exports
// (CoStar/Crexi/Excel "export") come through here so the agent reads them as
// the tabular data they are. exceljs is CommonJS — access defensively across
// interop shapes.
async function parseXLSX(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("exceljs");
  const Workbook = mod.Workbook ?? mod.default?.Workbook;
  if (!Workbook) return "[Could not load spreadsheet parser]";

  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);

  const escape = (raw: unknown): string => {
    let s: string;
    if (raw == null) s = "";
    else if (typeof raw === "object") {
      // exceljs rich values: { text }, { result }, { hyperlink }, dates, etc.
      const o = raw as Record<string, unknown>;
      s = String(o.text ?? o.result ?? o.hyperlink ?? (raw instanceof Date ? raw.toISOString() : JSON.stringify(raw)));
    } else s = String(raw);
    // CSV-escape: quote if it contains comma, quote, or newline.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const blocks: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const sheet of (workbook.worksheets as any[])) {
    const lines: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sheet.eachRow({ includeEmpty: false }, (row: any) => {
      // row.values is 1-indexed (index 0 is empty); slice it off.
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(vals.map(escape).join(","));
    });
    if (lines.length > 0) {
      blocks.push(`# Sheet: ${sheet.name}\n${lines.join("\n")}`);
    }
  }

  return blocks.length > 0 ? blocks.join("\n\n") : "[Empty spreadsheet]";
}
