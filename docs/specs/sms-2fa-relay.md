# SMS 2FA Relay

**Status:** Draft for Kyle's approval
**Owner:** Parker (PM) · **Requested by:** Kyle
**Date:** 2026-07-23
**Kyle's vision (verbatim intent):** "Casey communicates with Arthur, his agent. When Arthur tries to log in to CoStar, Arthur sends him a text. Casey just replies to the text with the code, and Arthur goes on and does work."

---

## 1. Problem

When Arthur (or any agent) hits an MFA screen mid-login, the platform today asks the client for the code via WhatsApp-first with email fallback. In practice neither channel is right: WhatsApp is **not configured on prod Oracle** (Twilio env vars unset), so every 2FA request falls through to email — and email round-trips take minutes (Gmail → Resend inbound lag), during which CoStar's code screen can expire or re-render. The client's actual behavior is: the code arrives *as a text on their phone*; the natural reply is *a text back*. Every minute of relay lag risks a failed login, a dead Remote Hands task, and a client watching their "team member" stall.

SMS is push-fast, works on every phone with zero app installs, has no WhatsApp 24-hour-window/template constraints, and matches where the code already is.

## 2. Goals

1. **SMS is the first channel** for both 2FA-request paths: the Remote Hands `need-2fa` handler and the runtime `request_2fa_code` tool.
2. **Reply-by-text works end to end:** client texts back the digits, Oracle captures the code, the worker's poll returns it, login completes — no email involved on the happy path.
3. **Median code-relay time under 60 seconds** (request sent → code captured), vs multiple minutes on the email path today.
4. **No silent failures:** the channel chain is exactly two — SMS first, email fallback. If both fail, the operator is alerted and the worker gets an explicit error.

## 3. Non-goals

- **A2P 10DLC / toll-free registration mechanics** — separate research track. This spec assumes +18178097106 can send; carrier-filtering risk is noted in Risks.
- **WhatsApp — anywhere in this relay** (Kyle, 2026-07-23: Meta hasn't approved the sender and we're not waiting). WhatsApp is removed from the 2FA channel chain entirely, not kept as a dormant fallback. It remains in use elsewhere on the platform (operator approvals) and no template work happens here.
- **Credential storage changes** — the portal Tools page and `resolve-cred` flow are untouched. The relay never stores the code beyond its in-memory TTL.
- **Any UI** — no portal/dashboard changes in v1 (portal card copy change is folded into the field-naming open question).
- **Durable relay state** — the in-memory maps stay in-memory by design; an Oracle restart mid-MFA means the worker re-requests. Acceptable at current volume.

## 4. Current state (code-grounded)

| Piece | Where | Today |
|---|---|---|
| Relay state | `oracle/index.ts` ~237–249 | `pending2fa` (clientId → taskId), `codes2fa` (clientId → code), `pending2faByPhone` (last-10-digits → clientId), `phoneKey()`, `MFA_TTL_MS` = 15 min. In-memory, Oracle-local. |
| Worker request path | `oracle/index.ts` `POST /extension/tasks/:taskId/need-2fa` (~6066) | WhatsApp-first via `Client.whatsappNumber`, email fallback. Respects `communicationSettings.mfaRelay.kind === "platform_email"` (email-first). Only finds `status: "active"` agents. |
| Worker code poll | `GET /extension/tasks/:taskId/2fa-code` (~6139) | Returns `codes2fa` entry once (consumed on read), null after TTL. |
| WhatsApp capture | `POST /webhooks/whatsapp` (~1545) | Matches sender via `pending2faByPhone` + TTL, extracts `\b(\d{4,8})\b`, writes `codes2fa`, replies TwiML "Got it". |
| Email capture | `/webhooks/email-inbound` (~1758) | Guarded by `pending2fa`; extracts code from reply top-text, writes `codes2fa`. |
| Runtime tool | `shared/runtime/engine.ts` `request_2fa_code` (~857) | **Email-only** today. Sends agent-response email, returns `isPause: true`; the client's email *reply* resumes the paused run through normal inbound processing. |
| Worker MFA loop | `remote-hands/worker.ts` `doMfa()` (~104) | POSTs `need-2fa`, polls `2fa-code` every 3 s for ~10 min, types the code. **No worker changes needed** — the relay is server-side. |
| Twilio wrapper | `shared/whatsapp.ts` | `sendWhatsApp()` with 3 retries; Twilio client factory already there. |

**Latent bug found during spec research (must fix in this build):** Oracle mounts only `express.json()`. Twilio posts webhooks as `application/x-www-form-urlencoded`, so on real Twilio traffic `req.body.Body` / `req.body.From` in `/webhooks/whatsapp` would be empty and every capture would miss. The new SMS webhook must mount `express.urlencoded({ extended: false })`, and the same middleware must be added to `/webhooks/whatsapp`.

## 5. User stories

- As **Casey (client)**, when Arthur hits CoStar's verification screen, I get **one short text from Arthur**, I reply with the digits, and Arthur finishes the job — no email, no portal, no app.
- As **Casey**, if I fat-finger the reply ("what code?"), I get one short nudge telling me to text just the digits — and my real reply still works.
- As **a client with no mobile number on file**, I still get the 2FA request by email, exactly as today — nothing breaks.
- As **Kyle (operator)**, if a 2FA request can't reach the client on *any* channel, I get an operator alert (email via the existing `sendKyleWhatsApp` fallback) instead of a task silently dying.
- As **any agent's client**, I never get a 2FA text from a paused or dry-run agent.

## 6. Requirements

### P0 — must ship

**R1. Shared relay module.** Move the 2FA relay state (`pending2fa`, `codes2fa`, `pending2faByPhone`, `phoneKey`, `MFA_TTL_MS`) out of `oracle/index.ts` into a new `shared/mfa-relay.ts`, exporting a single entry point used by *both* request paths:

```ts
relayMfaRequest({ clientId, agentId, service, mode: "worker" | "runtime" })
  → { channel: "sms" | "email" | "none", throttled?: boolean }
```

Rationale: `request_2fa_code` lives in `shared/runtime/engine.ts` and cannot reach maps declared inside `oracle/index.ts`; Oracle imports the runtime in-process, so a shared module gives both paths the same state. `MFA_TTL_MS` becomes env-overridable (`MFA_TTL_MS`, default 900000) so QA can test expiry without waiting 15 minutes.

**R2. `sendSms()` in `shared/whatsapp.ts`.** Same shape as `sendWhatsApp` (3 retries, logged, never logs the body at error level), `from` = `TWILIO_SMS_NUMBER`. Accepts optional `agentId`; when the agent has `dryRun: true`, capture to `DryRunLog` (kind `"sms"`, redacting nothing — the outbound request text contains no secrets) and return a synthetic sid instead of sending (mirrors the email intercept in `shared/email.ts` ~58).

**R3. SMS *replaces* WhatsApp in `need-2fa`.** The existing WhatsApp-first branch in the handler (`oracle/index.ts` ~6096–6107) is **deleted and replaced by an SMS branch** — not kept alongside it. The channel chain is exactly two: **SMS → email**. SMS sends to `Client.whatsappNumber` (the client's mobile — see Open Question 1). An explicit `communicationSettings.mfaRelay.kind === "platform_email"` still wins (email first, SMS second) — explicit client preference beats the platform default; a legacy `mfaRelay.kind === "platform_whatsapp"` value is treated as unset (platform default: SMS → email). On SMS send, register `pending2faByPhone` exactly as the WhatsApp branch did. Response returns the real channel: `{ ok: true, channel: "sms" }`. Worker log line ("asked the client for the CoStar code via sms") works with zero worker changes.

**R4. SMS first in `request_2fa_code`** (`shared/runtime/engine.ts`). Replace the email-only body with a call to `relayMfaRequest(mode: "runtime")`. Keep `isPause: true`. The tool's returned `content` must state which channel was used so the transcript is honest.

**R5. Runtime resume on SMS reply.** For `mode: "runtime"` pending entries, code capture must resume the paused run: dispatch `processInboundMessage({ agentId, userMessage: "Verification code: <digits>", channel, threadId })` on the same thread the email-reply path would use, so the parked conversation (and `resume_session_id` instruction) is found. For `mode: "worker"` entries, behavior is unchanged: write `codes2fa`, let the worker poll consume it. The pending entry carries `{ clientId, agentId, mode, at }` to make this dispatch possible.

**R6. Inbound SMS webhook — `POST /webhooks/sms`.** New Oracle endpoint, `express.urlencoded({ extended: false })` mounted on the route. Twilio posts `From`, `To`, `Body`, `MessageSid`. Behavior:
- Match `pending2faByPhone.get(phoneKey(From))` within TTL; extract `\b(\d{4,8})\b` from `Body`.
- **Code found:** capture per R5, delete the phone entry, reply TwiML `<Response><Message>Got it — entering your code now. Thanks!</Message></Response>`.
- **Pending but no digits (garbage reply):** keep the pending entry, reply once per pending request with the nudge copy (R8); subsequent garbage replies get empty TwiML (no loops with autoresponders).
- **Unknown sender / expired TTL:** reply `200` with empty TwiML `<Response/>` — never 4xx/5xx (Twilio retries + error-logs those), never a content reply to a stranger, never log the message body.
- **Remove the 2FA capture branch from `/webhooks/whatsapp`** (~1554–1566): with no WhatsApp sends registering `pending2faByPhone` entries it becomes dead code, and WhatsApp is out of the relay by decision. That endpoint reverts to operator approvals only. (Its urlencoded body-parser fix from §4 still ships alongside — it protects operator APPROVE/REJECT on real Twilio traffic, unrelated to the relay.)

**R7. Fallback + never-silent.** If the SMS send throws → email. If **both** channels fail: return `500 { error: "could not reach the client on any channel" }` to the worker (as today) **and** fire `sendKyleWhatsApp()` with client name + service + failing channels (reaches Kyle by email today per the existing operator-alert fallback). Throttle: if a pending request for the same client is under 2 minutes old, don't re-send — return `{ ok: true, channel, throttled: true }`. Hard cap 6 relay SMS per client per hour (in-memory counter); on cap, skip SMS (fall to email) and alert the operator once.

**R8. Client-facing SMS copy** (exact strings; "we/our team" voice rules apply — the agent speaks as itself, never names the operator; each fits one SMS segment where possible):

| Message | Copy |
|---|---|
| 2FA request | `{agentName} here — {service} just sent you a verification code. Text back just the code and I'll finish signing in.` |
| Code captured | `Got it — entering your code now. Thanks!` |
| Garbage nudge (once) | `Hmm — I couldn't spot a code in that. Text back just the digits and I'll take it from there.` |

**R9. Safety + billing invariants.** `need-2fa` continues to select only `status: "active"` agents (paused agents stay silent — verified by AC-7); dry-run agents never send real SMS (R2); relay messages are not billable interactions (no `interactionCount` bump — they're plumbing, not work product); codes are consumed on read and never persisted beyond TTL, never logged.

**R10. Config.** New env on Oracle: `TWILIO_SMS_NUMBER=+18178097106` (plus existing `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Kyle sets all secrets). Twilio console: point the number's inbound Messaging webhook at `https://oracle-production-c0ff.up.railway.app/webhooks/sms` (HTTP POST). Add `TWILIO_SMS_NUMBER` to the CLAUDE.md env list when shipping.

### P1 — fast follow

- **Twilio signature validation** (`X-Twilio-Signature`) on `/webhooks/sms` and `/webhooks/whatsapp`. The pending-map + TTL + digits-only guard already bounds abuse, so this is defense-in-depth, not a launch blocker.
- **`SmsSend` audit table** (mirroring `EmailSend`) so SMS gets the same delivery observability and gives seatbelts a durable substrate; until then the R7 in-memory cap is the seatbelt.
- **Portal copy update** on the WhatsApp card once Open Question 1 is decided.

### P2 — future

- `platform_sms` as a first-class `ChannelKind` in `shared/communication-settings.ts` so clients can pin their MFA relay to SMS explicitly (today SMS is simply the platform default).
- Durable relay state (DB-backed) if/when Oracle becomes multi-instance under Kubernetes — the shared-module design (R1) is the seam; nothing here blocks that migration.

## 7. Acceptance criteria (QA-runnable)

**Setup:** `ORACLE=https://oracle-production-c0ff.up.railway.app` (or local). `DEVICE_TOKEN` = the paired Remote Hands device token (`remote-hands/.env`). Test client = Casey's `clientId` with `whatsappNumber = "+18175551234"` (QA substitutes a real test phone for the live-SMS checks; synthetic webhook POSTs need no real phone). `TASK` = a claimed LocalTask id for that device. For AC-6, set `MFA_TTL_MS=10000` on a staging Oracle.

**AC-1 — Happy path, worker mode (the Casey/Arthur flow).**
```bash
curl -s -X POST "$ORACLE/extension/tasks/$TASK/need-2fa" \
  -H "X-Device-Token: $DEVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"service":"CoStar"}'
```
Expect `{"ok":true,"channel":"sms"}`. Real SMS arrives at the client phone from +18178097106 with body exactly: `Arthur here — CoStar just sent you a verification code. Text back just the code and I'll finish signing in.` Then simulate the reply:
```bash
curl -s -X POST "$ORACLE/webhooks/sms" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=+18175551234" --data-urlencode "To=+18178097106" \
  --data-urlencode "Body=482913" --data-urlencode "MessageSid=SMqa001"
```
Expect `200`, body `<Response><Message>Got it — entering your code now. Thanks!</Message></Response>`. Then:
```bash
curl -s "$ORACLE/extension/tasks/$TASK/2fa-code" -H "X-Device-Token: $DEVICE_TOKEN"
```
First call → `{"code":"482913"}`; immediate second call → `{"code":null}` (consumed on read). Full live check: run the worker against CoStar's MFA screen; `doMfa` logs `via sms`, the typed reply completes login. No `EmailSend` row is created and `Agent.interactionCount` is unchanged for the whole flow.

**AC-2 — No mobile on file → email fallback.** Null out `whatsappNumber` for the test client, repeat the `need-2fa` curl. Expect `{"ok":true,"channel":"email"}` and the existing 2FA email (subject `Arthur — verification code for CoStar`) at the client email. No SMS attempted.

**AC-3 — Garbage reply.** With a fresh pending request, POST the webhook with `Body=what code?`. Expect `200` + TwiML message `Hmm — I couldn't spot a code in that. Text back just the digits and I'll take it from there.`; `2fa-code` poll still returns `{"code":null}`; a second garbage reply returns empty `<Response/>`; a subsequent `Body=774421` still captures normally.

**AC-4 — Unknown sender.** POST the webhook with `From=+19998887777` (no pending entry). Expect `200`, body exactly `<Response/>`, no code captured, no reply SMS, and the log line contains no message body.

**AC-5 — Explicit email preference wins.** Set the agent's `communicationSettings.mfaRelay = {"kind":"platform_email"}`, repeat AC-1's first curl. Expect `{"ok":true,"channel":"email"}` with SMS untried.

**AC-6 — Expired TTL.** (Staging, `MFA_TTL_MS=10000`.) Send `need-2fa`, wait 15 s, POST a valid code reply. Expect `200` + empty `<Response/>`, and `2fa-code` returns `{"code":null}`.

**AC-7 — Paused agent stays silent.** Pause all of the client's agents (dashboard FLEET-CONTROL or `PATCH` status), repeat `need-2fa`. Expect `400 {"error":"no active agent, or no mobile/email on file"}` (the handler's refusal copy is updated as part of R3 — it must no longer say "WhatsApp") and **no SMS/email sent**.

**AC-8 — Throttle + never-silent.** Fire `need-2fa` twice within 2 min → second response includes `"throttled":true` and only one SMS arrives. With Twilio creds removed on staging and client email nulled, `need-2fa` → `500 {"error":"could not reach the client on any channel"}` **and** an operator alert email arrives at `OPERATOR_EMAIL`.

**AC-9 — Runtime path.** Trigger `request_2fa_code` (e.g. Atlas run that hits a login wall via `browse`): SMS arrives with the R8 request copy, run pauses. POST the code reply to `/webhooks/sms`. Expect the paused run to resume — a new `ConversationMessage` row `Verification code: <digits>` on the agent's thread and the run continuing (visible in the agent run log / `browse` resume with `resume_session_id`).

**AC-10 — Dry-run intercept.** Set `Agent.dryRun=true`, trigger the runtime path. Expect a `DryRunLog` row with `kind:"sms"` containing the would-be body, and no real SMS.

## 8. Success metrics

- **Leading:** median request→capture relay time < 60 s (log-derived, `2FA request sent` → `2FA code captured`); ≥ 90% of relays captured within TTL; CoStar Remote Hands task success rate on MFA-gated runs (target: Casey's runs stop failing on MFA timeout).
- **Lagging:** zero "agent stalled at login" client complaints per month; email-fallback share of relays trending toward ~0 for clients with a mobile on file.

## 9. Risks

- **Carrier filtering (A2P 10DLC).** Unregistered US traffic from +18178097106 may be filtered. Volume is tiny (single known recipient today) and the email fallback catches total failure, but the registration research track should land before this scales past a handful of clients.
- **In-memory state on redeploy.** A Railway deploy mid-MFA drops the pending entry; the worker's 10-min poll loop times out and the task fails cleanly. Known, accepted (matches existing design); P2 covers durability.
- **The `/webhooks/whatsapp` cleanup touches operator approvals.** Removing the 2FA capture branch and adding urlencoded parsing are both low risk (that path sees no real Twilio traffic today), but QA should re-run the existing operator APPROVE/REJECT curl checks after the change.
- **Legacy `mfaRelay: platform_whatsapp` settings.** Any agent with that preference stored silently falls back to the platform default (SMS → email) per R3. Acceptable — no client has WhatsApp relay working today (Twilio was never configured on prod).

## 10. Open questions — for Kyle (max 3, with recommended defaults)

1. **Where does the client's mobile number live?** Recommend: **reuse `Client.whatsappNumber` as-is for v1** — it's already the client's mobile, collected via the portal WhatsApp card. The naming mismatch is now real, though: with WhatsApp out of the relay, a field named `whatsappNumber` is the SMS target and the portal card's "WhatsApp" label misdescribes what we do with it. Recommended follow-up (not v1): rename to `mobileNumber` + retitle the card "Mobile number". Rename implications flagged: Prisma migration + the Railway sync-copy rule (schema.prisma is mirrored per service, all copies move together) + every `whatsappNumber` call site + portal copy. A dedicated second field is not recommended — two phone fields will drift. **Decision needed: reuse-as-is (recommended) vs rename/migrate now.**
2. **Ship SMS-first now on the unregistered number, or gate behind A2P registration?** Recommend: **ship now.** One low-volume number, one known recipient (Casey), email fallback intact; run the registration track in parallel and treat delivery failures as the signal to accelerate it.
3. **Should an explicit `mfaRelay: platform_email` preference still beat SMS-first?** Recommend: **yes** (spec'd in R3) — an explicit client choice always wins over a platform default. Only flagging because it means Casey's flow depends on his agent having no email preference set; QA should confirm Arthur's `communicationSettings.mfaRelay` is null before the live test.

## 11. Phasing (one verified step at a time)

1. **Step 1 — worker path live:** R1, R2, R3, R6, R7, R8, R9, R10 + the urlencoded fix. Verify with AC-1 through AC-8 (AC-1 live with Casey's real phone). **Stop for Kyle's verification.**
2. **Step 2 — runtime path:** R4, R5. Verify AC-9, AC-10. **Stop for Kyle's verification.**
3. **Step 3 — P1s:** signature validation, `SmsSend` audit table, portal copy (pending Open Question 1).

Each step is independently shippable; Step 1 alone delivers Kyle's stated vision for Casey/Arthur.
