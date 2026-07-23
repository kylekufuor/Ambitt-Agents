# SMS 2FA Relay — Implementation Plan

Author: Sloane (Tech Lead) — 2026-07-23
Spec: `docs/specs/sms-2fa-relay.md` did not exist at planning time; this plan is built from the CTO brief + the actual code. If Parker's spec lands with conflicts, the engineer resolves toward this plan's file map and flags deltas to the CTO.

**Scope update (Kyle, 2026-07-23, mid-planning): WhatsApp is OUT of the relay entirely.** The channel chain is exactly two: **SMS-first → email fallback.** The `/webhooks/whatsapp` endpoint STAYS (operator approve/reject + legacy capture branch), but the outbound WhatsApp attempt in the relay is removed.

---

## Product goal

When an agent (Remote Hands worker or runtime `browse`) hits a login 2FA wall, the platform texts the client via Twilio SMS from `+18178097106`; the client texts the code back; the waiting flow picks it up. Email remains the fallback. Capture is channel-agnostic: inbound code matching is keyed by the sender's phone number.

---

## Verified code reality (read, not remembered)

| Fact | Where |
|---|---|
| Relay state: `pending2fa` (clientId → {taskId, at}), `codes2fa` (clientId → {code, at}), `pending2faByPhone` (last-10-digits → {clientId, at}), `phoneKey()`, `MFA_TTL_MS = 15 min` — all module-local in Oracle | `oracle/index.ts:237-249` |
| WhatsApp 2FA capture branch: `pending2faByPhone.get(phoneKey(from))` + `\b(\d{4,8})\b` extract → `codes2fa.set` → TwiML ack `<Response><Message>…</Message></Response>` | `oracle/index.ts:1554-1566` |
| Email 2FA capture branch (worker-origin only, guarded by `pending2fa`): top-of-reply slice + same regex → `codes2fa.set` | `oracle/index.ts:1758-1777` |
| `need-2fa` handler: sets `pending2fa`, clears `codes2fa`, channel loop WhatsApp→email honoring `mfaRelay.kind === "platform_email"`, returns `{ok, channel}` | `oracle/index.ts:6066-6136` |
| Worker poll: `2fa-code` consumed-on-read; worker polls 3s × 200 = **10 min**, vs `MFA_TTL_MS` 15 min | `oracle/index.ts:6139-6149`, `remote-hands/worker.ts:104-122` |
| **Only `express.json` is mounted — `express.urlencoded` appears NOWHERE in Oracle.** Twilio posts `application/x-www-form-urlencoded`, so on Express 5 `req.body` is `undefined` for Twilio posts → the existing `/webhooks/whatsapp` handler (`req.body.Body?.trim()`) would throw → 500. Latent bug, never seen because Twilio WhatsApp isn't configured on prod | `oracle/index.ts:230`, grep for `urlencoded` = zero hits |
| Engine `request_2fa_code`: email-only via `sendAgentEmail(trigger:"agent-response")`, returns `isPause: true`. Client's email reply resumes the agent through the NORMAL inbound path (`pending2fa` is not set for engine-origin) → `processInboundMessage` → new run | `shared/runtime/engine.ts:857-886`, `oracle/index.ts:2196+` |
| Engine already imports `sendAgentEmail` from `oracle/lib/emailRouter.js` (layering already crossed; same process) | `shared/runtime/engine.ts:25` |
| Seatbelts: `checkOutboundSeatbelts(db, {agentId, recipient, subject, bodyText}, cfg)` counts **`EmailSend` rows** (short/hourly rate + subject-repetition per recipient). The emailRouter gates ONLY `trigger === "agent-response"` — explicitly because the Arthur "spammed Casey with code requests" loop used exactly this path — and on trip: `haltAgent` + operator alert | `shared/seatbelts.ts:55-114`, `oracle/lib/emailRouter.ts:257-288` |
| Dry-run intercept lives in `shared/email.ts:58-103`: if `Agent.dryRun`, capture to `DryRunLog(kind:"email", payload)` and return synthetic success. `sendWhatsApp` has NO dry-run check | `shared/email.ts`, `shared/whatsapp.ts` |
| `sendKyleWhatsApp` fallback philosophy: check env-configured → try → warn + fall back → never throw | `shared/whatsapp.ts:56-78` |
| Oracle deploys from **repo root** (`railway.json`: `npx tsx oracle/index.ts`) → new `shared/*` files need **no Railway service mirror**. Dashboard/portal have their own subdir railway.jsons and are untouched | `railway.json` |
| `EmailSend` model: `to`, `subject`, `emailType?`, `resendMessageId? @unique` (nullable, Postgres allows many nulls), `acceptedAt` default now | `prisma/schema.prisma:508+` |
| `Client.whatsappNumber String?` is the client mobile on file; `Agent.safetySensitivity String?`; `RuntimeInput.channel: "email" \| "whatsapp" \| "chat"` | `prisma/schema.prisma:22,174`, `shared/runtime/engine.ts:95-105` |
| Twilio inbound-message webhooks: respond 200 with `Content-Type: text/xml` and TwiML (`<Response/>` for silence, `<Response><Message>` to reply). **Inbound message webhooks are NOT retried** on failure (status callbacks are; we don't use them). Non-XML bodies risk error 12300 | Twilio webhooks FAQ / error docs (checked 2026-07-23) |

**No schema changes anywhere in this plan.** SCHEMA.md untouched; no per-service `schema.prisma` mirrors or client regeneration needed.

---

## Design decisions (tradeoffs)

1. **Relay state moves to `shared/mfa-relay.ts`.** The engine (shared/) must register a pending phone-capture, and the maps are currently module-local to `oracle/index.ts`. Oracle and the runtime run in ONE process (Oracle imports `processInboundMessage` directly), so a shared in-memory module works today. Rejected: engine→Oracle HTTP self-call (pointless in-process); duplicating maps (split-brain). K8s note: in-memory relay state is already the documented status quo ("not durable by design") — a future multi-replica split moves these maps to Redis/DB behind the same function signatures; nothing here deepens the coupling.
2. **Per-route `express.urlencoded`, not global.** Mount `express.urlencoded({ extended: false })` on `/webhooks/sms` AND on the existing `/webhooks/whatsapp` (fixes the latent 500). Rejected: global mount next to `express.json` — works (raw-body Stripe/Svix routes are mounted earlier), but per-route keeps the blast radius zero for every other endpoint.
3. **SMS sends are recorded as `EmailSend` rows (`emailType: "sms_2fa"`, `to` = phone, `resendMessageId: null`).** This makes the EXISTING seatbelt counters cover SMS volume + repetition across runs — the exact Arthur-spam shape — with zero schema change, and gives an audit trail for free. Rejected: new `SmsSend` table + seatbelt extension (schema change, both-schema mirrors, client regen, dashboard work) — not worth it for one message type; revisit if SMS grows beyond 2FA.
4. **Engine-origin SMS replies resume the agent by spawning a run.** Nothing polls `codes2fa` in the engine path (the run is paused/ended). So `pending2faByPhone` entries carry `origin: "worker" | "engine"` + `agentId`, and the SMS webhook, on an engine-origin capture, fire-and-forgets `processInboundMessage` + `dispatchAgentResponse` — the same resume shape an email reply produces today. Rejected: making the engine poll (there is no live run to poll from).
5. **Twilio signature validation on `/webhooks/sms`, env-gated.** `twilio.validateRequest(TWILIO_AUTH_TOKEN, sigHeader, ORACLE_URL + "/webhooks/sms", req.body)`; skip when `SMS_WEBHOOK_VALIDATE=0` (debug escape hatch) or when auth token is absent (endpoint is inert then anyway — no SMS could have been sent). Rejected: no validation (parity with `/webhooks/whatsapp`) — an unauthenticated endpoint that injects login codes by guessable phone number is a needless gift.
6. **Seatbelt-blocked SMS falls through to email, which trips the existing breaker.** The engine checks the seatbelt verdict before texting; if blocked, it does NOT halt from the engine — it falls to the email path, where `emailRouter` re-checks the same counters, blocks, halts, and alerts (existing plumbing). One halt path, no new imports in shared/.

---

## Increments (each independently shippable; Kyle verifies per step)

### Increment 1 — `shared/sms.ts` (new file; inert until imported)

Mirror `shared/whatsapp.ts` exactly, minus the `whatsapp:` prefix:

```ts
export function smsConfigured(): boolean
// true iff TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_SMS_NUMBER || TWILIO_WHATSAPP_NUMBER)

export async function sendSms(options: { to: string; message: string }, retries = 3): Promise<string>
// from = process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER  (both are +18178097106 today;
// TWILIO_SMS_NUMBER is canonical going forward — the old-name read is a one-line fallback only)
// same twilio client factory, same 3-attempt backoff (1000 * attempt), same logger.info/error shape, throws after retries
```

No dry-run logic here — `sendSms` stays dependency-free (twilio + logger only), like `sendWhatsApp`. Dry-run is the caller's job (increments 4/5), matching where the decision context (agentId) lives.

### Increment 2 — `shared/mfa-relay.ts` (new) + behavior-neutral refactor of `oracle/index.ts`

New module owning state + pure logic:

```ts
export const MFA_TTL_MS = 15 * 60 * 1000;
export const phoneKey = (s: string) => (s || "").replace(/\D/g, "").slice(-10);   // moved verbatim
export function extractMfaCode(text: string): string | null;
// \b(\d{4,8})\b on the top-of-reply slice (reuse the existing quote-strip from index.ts:1767 for email callers);
// ALSO normalize the hyphen/space-pair shape "123-456" / "123 456" → "123456" (common vendor format the current
// regex misses — it would match neither 3-digit group). Pure, no deps.

export type PendingOrigin = "worker" | "engine";
export function registerPendingByClient(clientId: string, taskId: string): void;          // pending2fa
export function registerPendingByPhone(phone: string, entry: { clientId: string; agentId?: string; origin: PendingOrigin }): void;
export function capturePhoneCode(from: string, body: string):
  | { matched: true; clientId: string; agentId?: string; origin: PendingOrigin; code: string }
  | { matched: false };
// TTL-checks the pending entry, extracts the code, sets codes2fa, deletes the phone pending. Expired == not matched.
export function captureEmailCode(clientId: string, emailText: string): { matched: boolean; code?: string };
// the pending2fa-guarded branch's logic; on capture also clears any pending2faByPhone entries for this clientId (staleness sweep)
export function takeCode(clientId: string): string | null;   // consumed-on-read + TTL, clears sibling pendings
```

`oracle/index.ts` changes (behavior-neutral): delete the local maps/`phoneKey`/`MFA_TTL_MS` (lines 237-249); the WhatsApp capture branch (1554-1566), the email capture branch (1761-1777), `need-2fa` (6080-6081, 6103), and `2fa-code` (6142-6148) call the module instead. `remote-hands/worker.ts` unchanged.

Test: `shared/mfa-relay.test.ts`, house assertion-script style (`node_modules/.bin/tsx shared/mfa-relay.test.ts`, like `shared/seatbelts.test.ts` / `oracle/lib/inbound-classify.test.ts`). **Nothing currently tests `phoneKey` or the code regex — they were inline in index.ts.** Cases: phoneKey (`+1 (817) 809-7106` ≡ `whatsapp:+18178097106` ≡ `8178097106`; short numbers; empty), extractMfaCode (`"123456"`, `"my code is 482913."`, `"G-482913"`, `"123-456"`→`123456`, `"123 456"`, quoted-reply email with code above the quote, no-code text, 3-digit reject, 9-digit reject), TTL expiry (fake `at`), consumed-on-read, unknown-phone no-match, origin round-trip.

### Increment 3 — `POST /webhooks/sms` on Oracle (`oracle/index.ts`, new route near `/webhooks/whatsapp`)

```ts
const twilioForm = express.urlencoded({ extended: false });
app.post("/webhooks/sms", twilioForm, async (req, res) => { ... });
// and fix the latent bug: app.post("/webhooks/whatsapp", twilioForm, async ... )
```

Handler order:
1. Signature validation per Decision 5 (fail → log.warn + `403`, no body).
2. `const hit = capturePhoneCode(req.body.From ?? "", req.body.Body?.trim() ?? "")`.
3. `matched && origin === "worker"` → code is in `codes2fa`; ack with TwiML reply (same copy as the WhatsApp branch: "Got it — entering your code now. Thanks!"), `res.type("text/xml").send("<Response><Message>…</Message></Response>")`.
4. `matched && origin === "engine"` → ack TwiML reply first, then fire-and-forget (`void (async () => …)().catch(log)`) the resume: `processInboundMessage({ agentId, userMessage: "Verification code relayed by SMS: <code>. Resume the parked browser session (resume_session_id) and enter it to finish logging in.", channel: "sms", threadId: thread-{agentId}-{clientId}, billable: false })` then `dispatchAgentResponse({ agentId, runtimeOutput, isReply: true })`. Requires widening `RuntimeInput.channel` to `"email" | "whatsapp" | "chat" | "sms"` (`shared/runtime/engine.ts:98` — DB column is a plain string; zero migration).
5. No match (unknown sender, expired pending, no code found) → `logger.info` + `res.type("text/xml").send("<Response></Response>")` — **200 + empty TwiML, never a reply.** Silence is deliberate: no auto-responder surface, and STOP/HELP keywords never get a platform reply (Twilio's own Advanced Opt-Out handles those upstream).

Never log the code itself at info level in production paths (log `clientId` + "captured", as the WhatsApp branch does).

Ships independently: endpoint is live and curl-testable before anything sends SMS.

### Increment 4 — `need-2fa` handler: SMS-first → email, WhatsApp removed (`oracle/index.ts:6066-6136`)

- Add `dryRun: true` and keep `communicationSettings` in the agent select; drop nothing else. `clientWhatsApp` (i.e. `Client.whatsappNumber` — it IS the client mobile on file; no new field, per brief) becomes `clientMobile`.
- Channel order: `const order = comms.mfaRelay?.kind === "platform_email" ? ["email","sms"] : ["sms","email"]`. A stored `platform_whatsapp` mfaRelay (legacy value; the zod enum keeps it) maps to the default SMS-first order — no settings migration, portal untouched.
- **Delete the WhatsApp send branch entirely** (lines 6096-6107). No dead code left behind; `/webhooks/whatsapp`'s capture branch stays (harmless legacy capture, still feeds `codes2fa` via the module).
- SMS branch: gate on `smsConfigured() && clientMobile`; if agent is `dryRun` → `prisma.dryRunLog.create({ kind: "sms", payload: { to, message, service, purpose: "2fa_relay" } })`, still `registerPendingByPhone`, `channel = "sms"` (mirrors `shared/email.ts`'s "runtime-identical, nothing leaves" philosophy — `sendWhatsApp` never had this; this is a strict improvement). Live path: `sendSms({...})` → on success `registerPendingByPhone(clientMobile, { clientId, origin: "worker" })` + write the `EmailSend` audit row (`emailType: "sms_2fa"`, `subject: "sms:2fa:" + service`, best-effort try/catch like `shared/email.ts:152-172`). On throw → `logger.warn` + fall to email (mirrors the existing per-channel try/catch).
- Email branch unchanged. `registerPendingByClient` still set up-front regardless of channel, so an email reply is captured even when the ask went out by SMS (wrong-channel coexistence, worker side).
- SMS copy (house voice, "we", human): `` `${agent.name} here — ${service} just sent you a verification code so I can finish signing in for you. Reply with just the code and I'll take it from there.` ``
- Return `{ok: true, channel}` with the channel that actually succeeded; `{500, "could not reach the client on any channel"}` when both fail (worker already handles this and logs the channel it's told — `remote-hands/worker.ts:111`).

### Increment 5 — engine `request_2fa_code`: SMS-first → email (`shared/runtime/engine.ts:857-886`)

- Widen the agent select: `{ agentType, dryRun, communicationSettings, safetySensitivity, client: { select: { email: true, whatsappNumber: true } } }`.
- Attempt order: same `mfaRelay` interpretation as Increment 4. No WhatsApp branch — ever.
- SMS attempt, in order:
  1. `smsConfigured() && client.whatsappNumber` else skip to email (silent degrade — `logger.info`, never throw; `sendKyleWhatsApp` fallback philosophy).
  2. Seatbelt: `const verdict = await checkOutboundSeatbelts(prisma, { agentId, recipient: phone, subject: "sms:2fa:" + svc, bodyText: message }, resolveSeatbeltConfig(agent.communicationSettings, agent.safetySensitivity))`; if `!verdict.allowed` → skip to the email path (which re-checks in `emailRouter` and, on trip, halts + alerts via the existing plumbing — Decision 6). `checkOutboundSeatbelts` / `resolveSeatbeltConfig` are shared/ imports; no new layering.
  3. Dry-run: if `agent.dryRun` → `DryRunLog(kind: "sms", payload)` capture, skip real send, return the same pause result as live (behavior-identical, nothing leaves — dry-run agents must NOT send real SMS).
  4. Live: `sendSms(...)` → `registerPendingByPhone(phone, { clientId, agentId, origin: "engine" })` + `EmailSend` audit row (`emailType: "sms_2fa"`). Return `{ content: "Texted <last-4-masked phone> asking for the <svc> code. Run paused — when the code arrives (by text or email reply) the run resumes; use resume_session_id to re-enter the parked browser session.", isError: false, isPause: true }` — the pause semantics are byte-for-byte the current contract.
  5. Any throw → `logger.warn` + fall to the existing email path (unchanged, still `sendAgentEmail(trigger: "agent-response")`, still seatbelt-gated + dry-run-intercepted downstream).
- Wrong-channel coexistence, engine side: asked by SMS but client replies by email → the email flows the normal inbound path and resumes the agent (status quo, already works, `pending2fa` untouched for engine origin). Asked by email but client texts the code → no phone pending exists → unknown-sender silence; acceptable (they were asked by email); noted in risk map.

### Increment 6 — env/config + deploy notes (no code)

Must exist on Oracle (Railway) before the SMS path activates — absent any of these, every flow degrades to email, never throws:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — already in the env contract, **verify actually set on prod Oracle** (memory says Twilio was NOT configured there; email fallback covers the gap until it is).
- `TWILIO_SMS_NUMBER=+18178097106` — new canonical var (add to CLAUDE.md env list). Fallback read of `TWILIO_WHATSAPP_NUMBER` exists but don't rely on it — that var may disappear.
- `ORACLE_URL` — already set; used for signature validation URL construction.
- Optional: `SMS_WEBHOOK_VALIDATE=0` escape hatch.

Twilio console (do AFTER Increment 3 deploys): on `+18178097106`, Messaging → "A message comes in" → Webhook `POST https://oracle-production-c0ff.up.railway.app/webhooks/sms`. Note: if that number is currently pointed at `/webhooks/whatsapp` for anything, SMS and WhatsApp have separate webhook configs — WhatsApp sender config is untouched.

No Railway mirrors needed (Oracle deploys from repo root — verified `railway.json`). No schema change, no prisma regen.

### Increment 7 — QA hand-off (test plan below made runnable)

Package the per-increment checks as a user story + paste-ready curls for QA/Kyle (house rule: hand off test plans, not "go test it").

---

## Verification plan (what "green" means, per increment)

**Inc 1:** `npx tsx -e 'import("./shared/sms.js").then(m => console.log(m.smsConfigured()))'` → `false` locally (no Twilio env) without throwing. Optional live smoke on prod env: one-off script texting Kyle's number.

**Inc 2:** `node_modules/.bin/tsx shared/mfa-relay.test.ts` → all cases pass. Then regression: the three call-site flows still work — `tsc --noEmit` clean, plus a synthetic worker round-trip on a dev Oracle: `POST /extension/tasks/T1/need-2fa` (email channel), reply-email webhook with a code, `GET /extension/tasks/T1/2fa-code` returns it once then null.

**Inc 3 (synthetic webhook curls, no Twilio needed — run with `SMS_WEBHOOK_VALIDATE=0`):**
```bash
# unknown sender → 200, empty TwiML, no reply
curl -si -X POST $ORACLE/webhooks/sms -d 'From=%2B15550001111&Body=482913' \
  -H 'Content-Type: application/x-www-form-urlencoded'
# expect: HTTP/1.1 200, Content-Type: text/xml, body '<Response></Response>'

# worker-origin happy path: seed a pending via need-2fa (SMS channel), then
curl -si -X POST $ORACLE/webhooks/sms -d 'From=%2B18175551234&Body=my%20code%20is%20482913' ...
# expect: TwiML with "Got it", then GET .../2fa-code → {"code":"482913"}, second GET → {"code":null}

# duplicate delivery: repeat the same POST → 200 empty TwiML (pending consumed), codes2fa unchanged
# form-parse regression: POST /webhooks/whatsapp with form body no longer 500s
```

**Inc 4:** dev worker (or curl impersonating it) hits `need-2fa` → response `{ok:true, channel:"sms"}` when Twilio env present, `{ok:true, channel:"email"}` when `TWILIO_SMS_NUMBER` unset (degrade proof, no throw in logs); dry-run agent → `DryRunLog` row `kind:"sms"`, no real text; `EmailSend` row `emailType:"sms_2fa"` written on live send.

**Inc 5:** dry-run agent runtime session where `browse` hits a 2FA wall → run pauses, `DryRunLog(kind:"sms")` captured, NO real SMS; live agent → SMS received on a test phone, `isPause` honored (run parked); seatbelt check: 3 forced `request_2fa_code` runs inside 15 min → third send blocked, agent system-paused by the emailRouter path, operator alert email arrives (prod alerts are email, not WhatsApp).

**E2E (QA, after Inc 6):** real phone as the "client" number on a test client. (a) Worker path: Remote Hands task hits CoStar MFA → text arrives from +18178097106 → reply with the code → worker enters it within seconds (vs minutes by email) → task completes. (b) Engine path: `browse` 2FA wall → text → reply → agent auto-resumes the parked session and reports completion by email. (c) Wrong channel: same as (a) but reply by EMAIL instead → still captured. (d) Fallback: unset `TWILIO_SMS_NUMBER` on Oracle → whole flow runs on email exactly as today.

---

## Risk map

- **Body parsing (root cause class):** no `urlencoded` parser exists in Oracle today; without the per-route mount, `/webhooks/sms` sees `req.body === undefined` and every Twilio post 500s. Same latent bug already sits on `/webhooks/whatsapp` — fixed in Inc 3. Per-route mounting means zero risk to Stripe/Svix raw-body routes (mounted earlier) and every JSON endpoint.
- **Double delivery:** Twilio does NOT retry inbound-message webhooks (verified against Twilio docs; retries apply to status callbacks, which we don't configure). Remaining duplicate source is the client texting twice — capture consumes the phone pending, so a second text falls into the unknown-sender silent path; `codes2fa` is consumed-on-read by the worker. Engine-origin duplicate text after capture → unknown-sender silence (pending already deleted).
- **Code arrives on the WRONG channel:** worker path sets BOTH `pending2fa` (email capture) and the phone pending (SMS capture) — first arrival wins, `captureEmailCode`/`takeCode` sweep sibling entries. Engine path asked-by-SMS + replied-by-email resumes via the normal inbound path (works today). Engine asked-by-EMAIL + replied-by-SMS is the one dead corner (no phone pending) → silent ignore; acceptable, client was asked to reply to the email. If both channels deliver (engine origin), the SMS spawns the resume and the later email spawns a second run whose context shows the login already done — rare, low-harm; noted, not engineered around.
- **TTL windows:** `MFA_TTL_MS` 15 min vs worker's 10-min poll — a code arriving in minutes 10-15 is captured but never polled (pre-existing). SMS shrinks reply latency to seconds, so exposure drops; not changing either constant.
- **Railway env absence:** `smsConfigured()` gates every send; missing SID/token/number → `logger.info` + email path, never a throw (mirrors `sendKyleWhatsApp`). Prod Oracle currently has NO Twilio vars (memory: operator alerts fall back to email) — the feature ships dark and activates when Inc 6 env lands.
- **A2P 10DLC / carrier filtering:** if `+18178097106` isn't A2P-registered, US carriers may filter outbound SMS — `sendSms` still resolves (Twilio accepts, delivery fails async). Client never gets the text; worker times out at 10 min; email was only tried if the send THREW. Mitigation is operational (register the number — flagged below); worst case degrades to today's email-only behavior after a timeout.
- **Codes in stored artifacts:** engine-origin SMS resume logs the code into `ConversationMessage` via `processInboundMessage` — exact parity with today's email-reply resume (which stores the reply body). Worker-origin captures never persist the code (in-memory only, matches WhatsApp branch). Webhook logging keeps codes out of log lines. Not making the stored-code story worse; a scrub of code-bearing messages is a separate ticket if Kyle wants it.
- **Dashboard cosmetics:** `EmailSend` rows with `emailType:"sms_2fa"` (null `resendMessageId`) will appear in email-delivery views as permanently "accepted". Harmless; filterable by `emailType` later.
- **Spoofed capture:** without signature validation, anyone knowing a client's mobile + the ~15-min window could inject a wrong code (failed login, no credential exposure). Signature validation (Inc 3) closes it; the `ORACLE_URL`-based URL construction must match the URL configured in Twilio exactly (railway.app URL, not the custom domain, unless both are updated together).
- **Kubernetes:** all relay state remains in-memory single-process — unchanged from today and explicitly non-durable by design; `shared/mfa-relay.ts`'s function boundary is the future Redis seam.

## Policy gaps for Kyle (via CTO — not invented here)

1. **A2P 10DLC registration status of `+18178097106`** — deliverability is a compliance/ops question, not a code question.
2. **SMS consent:** clients gave their mobile for WhatsApp; first-ever platform SMS to that number is a (mild) consent expansion. Suggest one line in onboarding/portal copy; needs Kyle's call.
3. **STOP handling:** Twilio auto-opt-out will hard-block sends (error 21610) after a STOP; we degrade to email silently. Whether the portal should surface "SMS opted out" is product policy.
