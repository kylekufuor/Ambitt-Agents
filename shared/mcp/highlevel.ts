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

const LOCATION_KEY = /location_?id$/i;
const ALT_ID_KEY = /^(?:query|path|body)_altId$/i;
const isLocationKey = (key: string) => LOCATION_KEY.test(key) || ALT_ID_KEY.test(key);

// The location is connection configuration, never a model-selected tenant.
// GoHighLevel's MCP flattens HTTP parameters into prefixed names
// (path_locationId, query_locationId, body_locationId, query_altId for
// payments), so the discovered input schema decides which keys exist. Every
// declared location key is overwritten with the configured location, any such
// key the schema does not declare is dropped, and nested ones are overwritten
// too. A model-supplied value is never forwarded.
export function bindHighLevelLocation(args: Record<string, unknown>, locationId: string, inputSchema?: Record<string, unknown>): Record<string, unknown> {
  const properties = (inputSchema as { properties?: unknown } | undefined)?.properties;
  const declared = properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties) : [];
  function scrub(value: unknown, nested: boolean): unknown {
    if (Array.isArray(value)) return value.map((item) => scrub(item, true));
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isLocationKey(key)) { if (nested) out[key] = locationId; continue; }
      out[key] = scrub(item, true);
    }
    return out;
  }
  const bound = scrub(args, false) as Record<string, unknown>;
  for (const key of declared) if (isLocationKey(key)) bound[key] = locationId;
  return bound;
}

// Name of the location parameter a tool's schema declares, if any.
export function highLevelLocationParameter(inputSchema?: Record<string, unknown>): string | undefined {
  const properties = (inputSchema as { properties?: unknown } | undefined)?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return undefined;
  return Object.keys(properties).find((key) => LOCATION_KEY.test(key));
}

export function isHighLevelReadTool(name: string): boolean {
  return /^(?:[a-z]+_)?(?:get|list|search|fetch|read|find|check|describe)(?:[-_]|$)/i.test(name);
}

// GoHighLevel messaging stays OFF until it has outbound-channel parity with
// email and SMS. Today a conversations_send-a-new-message call would bypass
// everything those channels get: Agent.autonomyLevel is enforced only in the
// prompt, no EmailSend/SmsSend audit row is written, and checkOutboundSeatbelts
// (rate + repetition trips, the spike monitor and auto-pause) only reads those
// tables. Matched by name against the live tools/list so a renamed or added
// send tool is caught too; read tools (get-messages, search-conversation) stay.
// Unlocking requires all three: a code gate on autonomyLevel, an audit row per
// send, and a checkOutboundSeatbelts call keyed on the GoHighLevel recipient.
const MESSAGING_TOOL = /send|messag|e-?mail|sms|whatsapp|voicemail|broadcast|campaign|workflow|notif/i;
export function isHighLevelMessagingTool(name: string): boolean {
  return !isHighLevelReadTool(name) && MESSAGING_TOOL.test(name);
}
export function withoutHighLevelMessaging<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter((tool) => !isHighLevelMessagingTool(tool.name));
}
export const HIGHLEVEL_MESSAGING_DISABLED = "GoHighLevel messaging is not enabled yet. No GoHighLevel message was sent. Reply through your own email or SMS channel instead.";

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const cancelled = () => new Error("The GoHighLevel request was cancelled.");
  if (signal?.aborted) { reject(cancelled()); return; }
  const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});

// Retries never outlive the SDK's 60 s request timeout: once it has told the
// caller the request failed, a late replay would do work the model believes
// never happened. The whole retry budget is capped well under that, and every
// wait ends the moment the transport's signal aborts.
const RETRY_BUDGET_MS = 20_000;

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

export function createHighLevelFetch(locationId: string, baseFetch: typeof fetch = fetch, sleep = wait, now = Date.now): typeof fetch {
  const key = credentialFingerprint(locationId);
  const limiter = limiters.get(key) ?? new HighLevelLimiter();
  limiters.set(key, limiter);
  return async (input, init) => {
    const startedAt = now();
    const signal = init?.signal ?? undefined;
    const cancelled = () => new Error("The GoHighLevel request was cancelled.");
    const retryAfter = async (delay: number, exhausted: string) => {
      if (signal?.aborted) throw cancelled();
      if (now() - startedAt + delay > RETRY_BUDGET_MS) throw new Error(exhausted);
      await sleep(Math.max(0, delay), signal);
      // Re-check right before the next request: an abort during the wait must
      // not be followed by another send, whatever sleep implementation ran.
      if (signal?.aborted) throw cancelled();
    };
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
        const unreachable = "We couldn't reach GoHighLevel. Try again shortly.";
        if (!safeToRetry || attempt >= 3) throw new Error(unreachable);
        await retryAfter(500 * 2 ** attempt, unreachable);
        continue;
      }
      // A rejected 429 can be replayed. Never blindly replay a write after a
      // timeout/5xx: it may already have sent the message or created the record.
      if ((response.status === 429 || (safeToRetry && response.status >= 500)) && attempt < 3) {
        const header = response.headers.get("retry-after");
        const seconds = Number(header);
        const date = header ? Date.parse(header) : NaN;
        const delay = header && Number.isFinite(seconds) ? seconds * 1000
          : Number.isFinite(date) ? Math.max(0, date - now()) : 500 * 2 ** attempt;
        await response.body?.cancel();
        await retryAfter(delay, "GoHighLevel is busy. Try again later.");
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
