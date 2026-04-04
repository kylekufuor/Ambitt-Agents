// ---------------------------------------------------------------------------
// CSV Attachment Generator
// ---------------------------------------------------------------------------
// Takes structured data and returns a Buffer ready for email attachment.
// No external dependencies — pure string building.
// ---------------------------------------------------------------------------

export interface CSVOptions {
  filename?: string;
  headers: string[];
  rows: string[][];
}

/**
 * Generate a CSV buffer from headers and rows.
 * Handles escaping: quotes, commas, newlines within fields.
 */
export function generateCSV(options: CSVOptions): Buffer {
  const { headers, rows } = options;

  const escapeField = (field: string): string => {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(","));

  for (const row of rows) {
    lines.push(row.map(escapeField).join(","));
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}

/**
 * Generate a CSV from an array of objects.
 * Headers are inferred from the keys of the first object.
 */
export function generateCSVFromObjects(
  data: Record<string, unknown>[],
  filename?: string
): Buffer {
  if (data.length === 0) {
    return Buffer.from("No data", "utf-8");
  }

  const headers = Object.keys(data[0]);
  const rows = data.map((obj) =>
    headers.map((h) => {
      const val = obj[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    })
  );

  return generateCSV({ filename, headers, rows });
}
