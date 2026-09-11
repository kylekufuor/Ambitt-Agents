import { createHash } from "node:crypto";

export const HIGHLEVEL_ID = "highlevel";
export const HIGHLEVEL_URL = "https://services.leadconnectorhq.com/mcp/";
export const HIGHLEVEL_DOCS = "https://help.gohighlevel.com/support/solutions/articles/155000005741";

export interface HighLevelCredential { pit: string; locationId: string }

export function parseHighLevelCredential(value: unknown): HighLevelCredential {
  let input: unknown = value;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { throw new Error("Enter a Private Integration Token and Location ID."); }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter a Private Integration Token and Location ID.");
  const { pit, locationId } = input as Record<string, unknown>;
  if (typeof pit !== "string" || !/^pit-[A-Za-z0-9_-]{8,500}$/.test(pit.trim())) throw new Error("Enter a valid Private Integration Token starting with pit-.");
  if (typeof locationId !== "string" || !/^[A-Za-z0-9_-]{5,100}$/.test(locationId.trim())) throw new Error("Enter a valid Location ID.");
  return { pit: pit.trim(), locationId: locationId.trim() };
}

export function highLevelHeaders(credential: string): Record<string, string> {
  const { pit, locationId } = parseHighLevelCredential(credential);
  return { Authorization: `Bearer ${pit}`, locationId };
}

export function credentialFingerprint(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

// The location is connection configuration, never a model-selected tenant.
export function bindHighLevelLocation(args: Record<string, unknown>, locationId: string): Record<string, unknown> {
  function inspect(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(inspect); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (/^location_?id$/i.test(key) && item !== locationId) throw new Error("This GoHighLevel connection can only access its configured location.");
      inspect(item);
    }
  }
  inspect(args);
  // Only populate a location field if the discovered schema uses one. The
  // locationId HTTP header supplies context for tools taking just a contactId.
  return args;
}

export function isHighLevelReadTool(name: string): boolean {
  return /^(?:[a-z]+_)?(?:get|list|search|fetch|read|find|check|describe)(?:[-_]|$)/i.test(name);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Shared by all sessions for a location in this process. Provider 429 responses
// remain authoritative across replicas and other integrations on the account.
export class HighLevelLimiter {
  private nextAt = 0;
  private day = -1;
  private count = 0;
  constructor(private now = Date.now, private sleep = wait) {}
  async take(): Promise<void> {
    const current = this.now();
    const day = Math.floor(current / 86_400_000);
    if (day !== this.day) { this.day = day; this.count = 0; }
    if (this.count >= 200_000) throw new Error("GoHighLevel's daily request allowance has been reached.");
    this.count++;
    const slot = Math.max(current, this.nextAt);
    this.nextAt = slot + 110; // at most 91 requests per 10 seconds
    if (slot > current) await this.sleep(slot - current);
  }
}

const limiters = new Map<string, HighLevelLimiter>();

export function createHighLevelFetch(locationId: string, baseFetch: typeof fetch = fetch, sleep = wait): typeof fetch {
  const key = credentialFingerprint(locationId);
  const limiter = limiters.get(key) ?? new HighLevelLimiter();
  limiters.set(key, limiter);
  return async (input, init) => {
    let safeToRetry = init?.method === "GET";
    if (typeof init?.body === "string") {
      try {
        const rpc = JSON.parse(init.body) as { method?: string; params?: { name?: string } };
        safeToRetry = ["initialize", "tools/list", "ping"].includes(rpc.method ?? "") ||
          (rpc.method === "tools/call" && isHighLevelReadTool(rpc.params?.name ?? ""));
      } catch { /* unknown operation: no replay after ambiguous failure */ }
    }
    for (let attempt = 0; ; attempt++) {
      await limiter.take();
      let response: Response;
      try {
        response = await baseFetch(input, { ...init, redirect: "error" });
      } catch {
        if (!safeToRetry || attempt >= 3) throw new Error("We couldn't reach GoHighLevel. Try again shortly.");
        await sleep(500 * 2 ** attempt);
        continue;
      }
      // A rejected 429 can be replayed. Never blindly replay a write after a
      // timeout/5xx: it may already have sent the message or created the record.
      if ((response.status === 429 || (safeToRetry && response.status >= 500)) && attempt < 3) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const date = retryAfter ? Date.parse(retryAfter) : NaN;
        const delay = retryAfter && Number.isFinite(seconds) ? seconds * 1000
          : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 500 * 2 ** attempt;
        if (delay > 30_000) throw new Error("GoHighLevel is busy. Try again later.");
        await response.body?.cancel();
        await sleep(Math.max(0, delay));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(response.status === 401 || response.status === 403
          ? "GoHighLevel refused access. Check the token, location and selected permissions."
          : "GoHighLevel couldn't complete the request. Try again shortly.");
      }
      return response;
    }
  };
}
