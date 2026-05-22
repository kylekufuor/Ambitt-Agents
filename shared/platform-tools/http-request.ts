import logger from "../logger.js";

// ---------------------------------------------------------------------------
// http_request — generic HTTP curl-equivalent for agents
// ---------------------------------------------------------------------------
// Lets an agent hit any HTTP(S) URL with any method, headers, and body. Used
// today by Marco (our QA tester) for endpoint smoke tests; useful for any
// future agent that needs to call an API that doesn't have a Composio
// connector or is internal to Ambitt.
//
// Safety:
//   - Only http:// and https:// schemes (no file://, gopher://, etc.)
//   - 30-second hard timeout (cancels via AbortController)
//   - Response body truncated to 32 KB returned to the agent — huge payloads
//     are summarized at the front and back, with the omitted bytes counted.
//   - Headers Authorization/Cookie are stripped from logger output to keep
//     secrets out of logs. The actual request still sends them.
//
// Not exposed: cookies jar, redirect-count override, raw socket. If we need
// those, we add them — but keep the default surface small.
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB shown to the agent
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-api-key"]);

export interface HttpRequestInput {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  headers?: Record<string, string>;
  /** Plain text or JSON-stringified body. For JSON pass the stringified form + Content-Type header. */
  body?: string;
  timeoutMs?: number;
}

export interface HttpRequestResult {
  status: "ok" | "error";
  /** HTTP status code (only present on status:"ok") */
  statusCode?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodyTruncated?: boolean;
  responseBytes?: number;
  /** Human-readable error message (only on status:"error") */
  error?: string;
}

export async function httpRequest(input: HttpRequestInput): Promise<HttpRequestResult> {
  const method = (input.method ?? "GET").toUpperCase() as HttpRequestInput["method"];
  const url = input.url;

  if (!url || typeof url !== "string") {
    return { status: "error", error: "url is required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "error", error: `invalid url: ${url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "error", error: `unsupported scheme: ${parsed.protocol} (only http/https allowed)` };
  }

  const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const safeHeaders = redactSensitive(input.headers ?? {});
  logger.info("http_request: outbound", {
    method,
    url: parsed.toString(),
    headers: safeHeaders,
    bodyBytes: input.body ? Buffer.byteLength(input.body, "utf-8") : 0,
  });

  try {
    const res = await fetch(parsed.toString(), {
      method,
      headers: input.headers,
      body: input.body && method !== "GET" && method !== "HEAD" ? input.body : undefined,
      signal: controller.signal,
    });

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const rawText = await res.text();
    const bytes = Buffer.byteLength(rawText, "utf-8");
    const truncated = bytes > MAX_BODY_BYTES;
    const body = truncated ? truncateBody(rawText, bytes) : rawText;

    return {
      status: "ok",
      statusCode: res.status,
      statusText: res.statusText,
      responseHeaders,
      responseBody: body,
      responseBodyTruncated: truncated,
      responseBytes: bytes,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted")) {
      return { status: "error", error: `request timed out after ${timeoutMs}ms` };
    }
    return { status: "error", error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function redactSensitive(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "<redacted>" : v;
  }
  return out;
}

function truncateBody(text: string, totalBytes: number): string {
  // Keep the first 24KB + last 4KB so the agent sees both the opening JSON
  // structure and any closing bracket/error trailer.
  const head = text.slice(0, 24 * 1024);
  const tail = text.slice(-4 * 1024);
  return `${head}\n\n... [truncated ${totalBytes - 28 * 1024} bytes from the middle; full body was ${totalBytes} bytes] ...\n\n${tail}`;
}

export function formatHttpResult(result: HttpRequestResult): string {
  if (result.status === "error") {
    return `ERROR: ${result.error}`;
  }
  const lines: string[] = [];
  lines.push(`HTTP ${result.statusCode} ${result.statusText ?? ""}`);
  lines.push("");
  lines.push("Response headers:");
  for (const [k, v] of Object.entries(result.responseHeaders ?? {})) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push(`Response body (${result.responseBytes ?? 0} bytes${result.responseBodyTruncated ? ", truncated" : ""}):`);
  lines.push(result.responseBody ?? "");
  return lines.join("\n");
}
