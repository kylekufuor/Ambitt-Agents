# Oracle control-plane authentication

Status: PLAN — not implemented
Author: Sloane (Tech Lead)
Date: 2026-07-28
Approved by: Kyle (close the live hole)
Blocks on: concurrent engineer work in `oracle/scheduler.ts`, `oracle/monitor.ts`, `oracle/spike-monitor.ts`, `dashboard/**`. Execute after that lands.

---

## 1. The hole, stated precisely

`oracle/index.ts` mounts exactly two pieces of middleware: a permissive CORS reflector (lines 24–43) and `express.json()` (line 231). Nothing else. Oracle is internet-facing at `https://oracle-production-c0ff.up.railway.app`.

Commit `75089c9` added `resolveControlRequester()` in `oracle/lib/pause-control.ts`, which makes an *unstated* caller default to `"client"` authority. That closes portal-side escalation. It does nothing about an anonymous caller who simply types `"operator"`.

### What an anonymous caller can do today

Ranked by severity, not by what the brief named:

| # | Call | Effect |
|---|------|--------|
| 1 | `POST /webhooks/email-inbound` with a forged `email.received` body | **Full agent takeover.** No signature verification at all — the handler reads sender/subject/body straight out of `event.data` (line ~1745) and `checkInboundAuth` compares the attacker-supplied `from` header against the client's email. Spoof it and the agent runs tools, sends mail, spends money, and now honours plain-language halt/resume intents. |
| 2 | `POST /agents/pause-all` | Halts the entire fleet. One unauthenticated request. |
| 3 | `POST /agents/:id/resume` `{"requester":"operator"}` | Lifts a **system** halt — spike auto-pause, outbound seatbelt, budget cap. Every safety control we shipped this month is bypassed by one word in a JSON body. |
| 4 | `POST /agents/:id/whatsapp` | Re-points the client's MFA-relay destination to the attacker's phone → the agent texts *them* the client's 2FA codes. |
| 5 | `PUT /agents/:id/communication-settings` | Adds an address to `inbound.allowedSenders` → attacker becomes an authorized inbound emailer for someone else's agent. Persistent takeover, no forgery needed afterwards. |
| 6 | `POST /agents/:id/run` | Makes any agent do a real run and email its client. Repeatedly. Reputational + spend. |
| 7 | `POST /webhooks/sms` `From=<client mobile>&Body=123456` | No Twilio signature check. Inject a fake 2FA code into a live relay. |
| 8 | `POST /credentials/:clientId`, `/agents/:id/tools/credentials/:itemId`, `/tools/custom-credentials` | Write credentials into any client's agent / 1Password vault. |
| 9 | `POST /improve`, `POST /cron/improvement`, `POST /builds` | Opus-class spend, unmetered, on demand. |
| 10 | `POST /agents/:id/kill` / `/approve` / `/reject` / `/pause` | Named in the brief. Real, but below the above. |
| 11 | `GET /fleet`, `/agents/:id/example-emails`, `/agents/:id/tools`, `/composio/connections/:clientId`, `/tools/status/:clientId` | Read every client's business data, email content, connected-tool inventory. |
| 12 | `POST /onboarding/prospects/find-or-create` `{"sendEmail":true}` | Open email relay — makes Atlas send our-domain mail to any address. Deliverability/abuse risk on `ambitt.agency`. |

Items 1 and 7 are **not fixed by an operator key** — third parties call those and can't carry our secret. They need signature verification. That is Phase 3 below and it is not optional.

---

## 2. Design decisions

### 2a. Two keys, not one. Authority ceiling comes from the key, never from the body.

`ORACLE_OPERATOR_KEY` (dashboard + Kyle's CLI) and `ORACLE_PORTAL_KEY` (client portal). A request carrying the portal key **cannot** obtain operator authority, even if its body says `"operator"` — it is silently downgraded to `"client"` and a WARN is logged.

Rejected — single shared "trusted service" key: the portal would then be one bug (or one compromise) away from lifting a system safety halt, which is the exact class of failure `75089c9` was written to prevent. Authentication (which service) and authorization (what authority) must be separate axes.

Rejected — Oracle verifies the client's Supabase JWT directly: correct end-state, removes the portal from the trust chain entirely, and it is the right K8s/multi-tenant shape. But it needs a JWKS verifier plus per-route ownership checks on ~15 routes. Not needed to close this hole. **Deferred to Phase 4, recorded not forgotten.**

### 2b. Does the portal need a key at all? Yes.

The brief asks whether caller-declared `"client"` is acceptable given a client can only downgrade. It is not, for two reasons:

1. It does not only downgrade. `POST /agents/:id/pause` `{"by":"client"}` against an *active* agent is a real state change: it unregisters the cron, cancels onboarding checkpoints, and the paying client sees their agent stopped. That is targeted DoS against a customer, and the attacker only needs an agent id.
2. Pause/resume is the smallest part of the portal-proxied surface. The same anonymous access reaches `/agents/:id/whatsapp` (MFA hijack), `/communication-settings` (persistent takeover), `/tools/disconnect`, `/tools/credentials/:itemId`. Authenticating "you are the portal, and the portal has already checked a Supabase session + `verifyAgentOwnership`" is required regardless of how we resolve the pause-authority question.

So the portal gets `ORACLE_PORTAL_KEY` and the `"client"` body field remains — the key proves *which service*, the body declares *which authority within that service's ceiling*.

### 2c. Default-deny classifier, mounted once.

One `app.use()` in `oracle/index.ts` consulting a pure exported function. Route class comes from an explicit **public** table and an explicit **client** table; **everything unmatched is operator-only**.

Rejected — per-route middleware args (`app.post(path, requireOperator, handler)`): more explicit and greppable, but a new route added six months from now would be unprotected by default. Default-deny is worth the small cost of maintaining a path table, and the table lives in a unit test that asserts the class of every route in the repo — so the table *is* the inventory, and it fails loudly when it drifts.

The classifier never imports express. It takes `(method: string, path: string)` and plain header objects, so it is testable with no server boot, per house style (`oracle/lib/inbound-classify.test.ts`).

### 2d. Rollout: mode flag separate from secret. This is the answer to Devon's 403 flag.

Devon is right that "enforce whenever the key is set" still breaks: Oracle would start rejecting the moment the secret lands on Oracle, and if the dashboard's copy is typo'd we find out via 403s in prod.

Split them:

- `ORACLE_OPERATOR_KEY` / `ORACLE_PORTAL_KEY` — the secrets.
- `CONTROL_AUTH_MODE` — `observe` (default when unset) or `enforce`. Plain non-secret var.

In **observe** mode the guard classifies the route, verifies the key if it has one, logs the verdict, and calls `next()` regardless. That gives a step where Oracle *already knows the dashboard's key is correct* before anything is enforced. Enforcement is then a one-variable flip with a one-variable rollback and no code deploy.

**Fail-open on misconfiguration.** If `CONTROL_AUTH_MODE=enforce` but a key env var is missing or blank, the guard allows the request and logs `ERROR control-auth: enforce requested but no key configured`. Deliberate: locking Kyle out of `/agents/pause-all` during a runaway is a worse outcome than leaving the hole open another hour. The compensating control is detection — see 2e. **Flag for Kyle: a reviewer may reasonably argue for fail-closed. This is a judgement call, not a technical constraint.**

### 2e. Misconfiguration must be loud.

- `GET /health` gains `controlAuth: "enforce" | "observe" | "misconfigured"` (posture only, never the key, never a hash of it).
- `shared/health/integration-healthcheck.ts` gains a check that reports a problem when posture is not `enforce`. That endpoint already runs weekly on cron and alerts Kyle by email (per `reference_operator_alerts_channel`), so an accidentally-unset key surfaces within a week and on demand via `GET /health/integrations`.

### 2f. CORS (lines 24–43) — yes, too permissive; no, it is not the vulnerability.

Three concrete bugs:

- `origin.includes("ambitt.agency")` matches `https://ambitt.agency.evil.com`. Same class of bug for `railway.app` and `localhost`.
- `origin.startsWith("chrome-extension://")` allows every Chrome extension in existence, not ours.
- Origin is reflected back verbatim.

It is **not** the cause of this incident: `Access-Control-Allow-Credentials` is never set, so a cross-origin browser request carries no cookies and can do nothing curl couldn't already do. After the auth fix it matters even less for control routes.

It still matters for the routes that stay readable — `GET /composio/connections/:clientId`, `GET /agents/:id/tools`, `GET /chat/:agentId/history` — where a malicious page could *read* the response cross-origin today. Cheap to fix in the same change, so we do: exact-origin allowlist via `new URL(origin).origin`, no substring matching.

**Deliberate omission: the operator/portal header is NOT added to `Access-Control-Allow-Headers`.** A browser preflight for it will fail. That is the point — it makes it structurally impossible to ship the key to browser JS, which forces the dashboard's remaining browser→Oracle calls through server proxies (step 5).

### 2g. Rate limiting — ship detection now, defer real limiting.

Recommendation: **do not** add per-route rate limiting in this change. In-memory limiting is wrong under multiple replicas (build rule 14) and `express-rate-limit` adds a dependency for a threat that a 256-bit key already defeats.

**Do** add a failed-auth counter (`oracle/lib/auth-abuse.ts`): count *rejections only*, keyed by IP, and after N in a window fire exactly one `sendKyleWhatsApp` (which falls back to operator email on prod) and start returning 429 for that IP. Because it only counts failures it can never degrade legitimate traffic, and per-replica state is fine since it is advisory. Value is the signal — "someone is probing our control plane" — not the throttle.

Deferred: durable/shared rate limiting for the genuinely public spend routes (`/chat/:agentId/messages`, `/extension/tasks/:taskId/step`, `/onboarding/prospects/:id/event`, `/extension/pair` code brute-force). Needs Redis or Railway edge; revisit at K8s.

---

## 3. Full route inventory

Classes: **OP** = operator key required · **CL** = portal *or* operator key required · **PUB** = reachable without our key.

### OP — operator only (44)

`GET /health/integrations` (unauth vendor-API amplification) · `GET /fleet` · `POST /agents/scaffold` · `POST /agents/:id/approve` · `POST /agents/:id/send-tools-invite` · `POST /agents/:id/reject` · `POST /agents/pause-all` · `POST /agents/:id/dry-run` · `POST /agents/:id/kill` · `POST /agents/:id/run` · `ALL /mcp/builder` · `POST /builds` · `GET /builds/:id` · `POST /builds/:id/cancel` · `GET /prospects/:id/builds` · `GET /agents/:id/improvements` · `POST /improvements/:id/approve` · `POST /improvements/:id/reject` · `POST /improvements/:id/revert` · `POST /onboard` · `POST /onboarding/prospects/:id/generate-prd` · `GET /onboarding/prospects/:id/prd-html` · `POST /onboarding/prospects/:id/generate-quote` · `POST /onboarding/prospects/:id/quote-save` · `POST /onboarding/prospects/:id/quote-send` · `POST /onboarding/prospects/:id/convert` · `POST /credentials/:clientId` · `POST /tools/test` · `POST /improve` · `POST /import` · `POST /cron/fleet-health` · `POST /cron/improvement`

Notes:
- `ALL /mcp/builder` has **no auth of any kind** and exposes the agent-builder toolset. It is reached only by Fable/Managed-Agents, which is gated behind `FABLE_FUNNEL_ENABLED` (off in prod) — so locking it is free today. `shared/managed-agents/types.ts` `mcp_toolset` supports `headers` / `authorization_token`, so when the funnel is switched on, `scripts/seed-fable-agents.ts` must thread the operator key through. **Coordination point, flagged in Risks.**
- `POST /onboarding/prospects/find-or-create` is PUB when `sendEmail` is falsy, **OP when `sendEmail: true`**. That is a body-dependent split, so it is enforced in the handler, not the classifier.

### CL — portal or operator (20)

`POST|GET /agents/:id/pause` `/resume` · `PATCH /agents/:id/schedule` · `PATCH /agents/:id/config` · `POST /agents/:id/tool-requests` · `POST|GET /agents/:id/documents` · `GET /agents/:id/example-emails` · `GET /agents/:id/tools` · `GET|POST /agents/:id/whatsapp` · `GET|PUT /agents/:id/communication-settings` · `POST /agents/:id/tools/custom-credentials` · `POST /agents/:id/tools/disconnect` · `POST /agents/:id/tools/credentials/:itemId` · `POST /agents/:id/extension/pairing-code` · `POST /composio/connect` · `POST /composio/connect-apikey` · `GET /composio/connections/:clientId` · `GET /tools/status/:clientId` · `POST /onboarding/prospects/:id/prd-approve` · `POST /onboarding/prospects/:id/quote-decided`

Extra server-side rule on `PATCH /agents/:id/config`: reject `safetySensitivity` when the caller is the portal (403). It is an operator-only control per the fleet-safety design. `client-portal/src/app/api/agents/[id]/config/route.ts` already filters it, but that filter lives on the *untrusted* side of the boundary — Oracle must enforce it too.

### PUB — with their own auth (already sound)

| Route | Auth it has |
|---|---|
| `POST /webhooks/stripe` | Stripe signature verified ✅ |
| `POST /webhooks/email-events` | Svix signature verified ✅ — but `RESEND_WEBHOOK_SECRET` is **not set on Railway**, so it currently 200-acks and drops every event (known, see `project_email_delivery_observability`) |
| `POST /chat/:agentId/messages`, `GET /chat/:agentId/history` | HMAC chat token, agent+client binding checked ✅ |
| `GET /composio/callback` | Verifies with Composio that the connection is genuinely ACTIVE ✅ |
| `GET /extension/poll`, `POST /extension/tasks/:taskId/{allow,result,step,resolve-cred,need-2fa}`, `GET .../2fa-code` | Signed device token ✅. Note `resolve-cred` returns plaintext credentials — the device token is the entire defence. |
| `POST /extension/pair` | Pairing code IS the handshake, by design ✅ |

### PUB — with NO auth (flagged)

| Route | Gap | Plan |
|---|---|---|
| `POST /webhooks/email-inbound` | **No signature.** Sender identity is taken from the attacker-controlled payload. Full agent takeover. | **Phase 3 — in scope** |
| `POST /webhooks/sms` | No Twilio `X-Twilio-Signature` validation. Fake 2FA-code injection. | **Phase 3 — in scope** |
| `POST /webhooks/whatsapp` | Only `from.includes(KYLE_WHATSAPP_NUMBER)` — forgeable, and `includes` is a substring match. Grants operator approve/reject. | **Phase 3 — in scope** |
| `GET /composio/auth-scheme/:appName` | Unauth proxy to Composio using our API key. Quota abuse only. | Defer |
| `POST /onboarding/prospects/:id/{customize-questions,event}` | Prospect-id-guessable; triggers Atlas LLM work + email. | Defer (documented accepted tradeoff, `oracle/index.ts` ~2356) |
| `GET /health`, `GET /composio/catalog`, `GET /composio/apps`, `GET /tools/catalog`, `GET /onboarding/prospects/:id/quote-html` | Intentionally public, no sensitive data | No action |

**Covered by this plan:** everything in OP + CL (Phases 1–2), plus the three unsigned webhooks (Phase 3).
**Explicitly deferred:** Composio auth-scheme proxy, prospect-flow enumeration, durable rate limiting, Supabase-JWT-forwarding (Phase 4).

---

## 4. Implementation — ordered steps

Each step is independently shippable and independently verifiable. Stop after each and let Kyle verify.

### Step 1 — Pure auth logic (no wiring, no behaviour change)

**New** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/control-auth.ts` — zero deps except `node:crypto`, no express import.

```ts
export type RouteClass = "public" | "client" | "operator";
export type KeyKind = "operator" | "portal" | "none";
export type AuthMode = "observe" | "enforce";

export function classifyRoute(method: string, path: string): RouteClass;
export function identifyCaller(
  headers: Record<string, string | string[] | undefined>,
  expected: { operator?: string; portal?: string }
): KeyKind;
export function authVerdict(cls: RouteClass, kind: KeyKind): { allow: boolean; reason: string };
export function readMode(raw: string | undefined): AuthMode;      // default "observe"
export function isMisconfigured(mode: AuthMode, expected: { operator?: string; portal?: string }): boolean;
```

- `classifyRoute`: PUBLIC table first, then CLIENT table, then `"operator"`. Segment matcher — split on `/`, drop empties, `:param` is a wildcard, literal segments compared case-insensitively. Normalise trailing slash. ~15 lines, no regex, no `path-to-regexp`.
- `identifyCaller`: header `x-ambitt-operator-key` → operator, `x-ambitt-portal-key` → portal. Operator wins if both present. Compare with SHA-256-then-`crypto.timingSafeEqual` so length never leaks and unequal lengths never throw. A blank/undefined `expected` value never matches anything.
- `authVerdict`: `public` → allow. `client` → allow for portal|operator. `operator` → allow for operator only.
- Never log, never return, never hash-into-output any key material.

**New** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/control-auth.test.ts` — assertion script, house style, `// Run: node_modules/.bin/tsx oracle/lib/control-auth.test.ts`.

**New** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/cors-origin.ts` + `.test.ts`

```ts
export function isAllowedOrigin(origin: string | undefined, opts: {
  extensionOrigins?: string[];   // from EXTENSION_ORIGIN_ALLOWLIST, comma-separated
}): boolean;
```
Exact-match set: `https://dashboard.ambitt.agency`, `https://portal.ambitt.agency`, `https://clients.ambitt.agency`, `https://ambitt.agency`, `https://www.ambitt.agency`, the three `*.up.railway.app` service origins, `http://localhost:3000|3001|3002`. Parse with `new URL()`; compare `.origin`. If `extensionOrigins` is empty, **fall back to today's `chrome-extension://` prefix behaviour** so we cannot break extension polling before Kyle has the id.

**New** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/auth-abuse.ts` + `.test.ts`

```ts
export function recordFailure(ip: string, now?: number): { throttled: boolean; alert: boolean };
export function resetAll(): void;   // test hook
```
Sliding window, in-memory `Map`, capped size so it cannot grow unbounded. `alert: true` exactly once per IP per window.

**New** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/types/express.d.ts` — module augmentation adding `callerKind?: KeyKind` to `Express.Request`. Keeps TS strict, avoids `any` casts, keeps `control-auth.ts` express-free.

**Changed** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/pause-control.ts` — add, next to `resolveControlRequester` (do not modify that function):

```ts
export function resolveAuthority(keyKind: "operator" | "portal" | "none", body: unknown): "client" | "operator" {
  if (keyKind === "portal") return "client";   // portal can never hold operator authority
  return resolveControlRequester(body);        // operator key, or legacy/observe mode
}
```

**Changed** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/lib/pause-control.test.ts` — add the `resolveAuthority` matrix.

**Verify:** four test scripts exit 0. Nothing deployed. Prod untouched.

---

### Step 2 — Wire the guard into Oracle (observe mode, still a no-op in prod)

**Changed** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/index.ts`:

1. **Lines 24–43** — replace the CORS body with `isAllowedOrigin(...)`. Keep `Access-Control-Allow-Headers` exactly as-is (`Content-Type, Authorization, X-Device-Token`). Add `PATCH, PUT, DELETE` to `Allow-Methods` (currently only `GET, POST, OPTIONS`, which is already wrong for the PATCH routes). Do **not** add the key headers.
2. **Immediately after line 231 (`express.json()`)** — insert the guard, ~30 lines:
   - skip `OPTIONS`
   - `classifyRoute(req.method, req.path)` → `identifyCaller(req.headers, {...})` → `authVerdict(...)`
   - set `req.callerKind`
   - `misconfigured` → allow + `logger.error` (rate-limited to once/60s)
   - `mode === "observe"` → log `{ path, method, cls, kind, wouldAllow }` at info, `next()`
   - `mode === "enforce"` and `!allow` → `recordFailure(req.ip)`, `logger.warn`, fire the one-shot alert when `alert`, respond `403 { error: "Unauthorized" }` (or 429 when throttled). Response body must not reveal the class or the expected header name.
   - Placement note: `/webhooks/stripe` and `/webhooks/email-events` are mounted *above* `express.json()` and therefore never reach the guard. Correct — they are PUB. They are still listed in the public table for documentation and for the drift test.
3. **`GET /health`** — add `controlAuth: <posture>`.
4. **`POST /agents/:id/pause` (line 566)** and **`/resume` (line 599)** — swap `resolveControlRequester(req.body)` for `resolveAuthority(req.callerKind ?? "none", req.body)`. Add a WARN when a portal caller declared `"operator"` and got downgraded.
5. **`PATCH /agents/:id/config` (line 1260)** — `if (req.callerKind === "portal" && safetySensitivity !== undefined) → 403`.
6. **`POST /onboarding/prospects/find-or-create` (line 2367)** — `if (shouldEmail && req.callerKind !== "operator") → 403` (enforce mode only; in observe mode log the would-reject).

**Changed** `/Users/kylekufuor/Projects/Ambitt Agents/shared/health/integration-healthcheck.ts` — add a `control-auth` posture check that reports a problem when posture ≠ `enforce`.

**Deploy:** Oracle only. `CONTROL_AUTH_MODE` unset, no keys set → observe mode, zero behaviour change.

**Verify:** prod unchanged (dashboard buttons, portal buttons, inbound email all still work); Oracle logs now emit one `control-auth` line per request showing class + `kind: "none"`.

---

### Step 3 — Callers send the header

**New** `/Users/kylekufuor/Projects/Ambitt Agents/dashboard/src/lib/oracle.ts`:

```ts
// server-only — never import from a "use client" file
export function oracleBase(): string;
export async function oracleFetch(path: string, init?: RequestInit): Promise<Response>;
```
Injects `x-ambitt-operator-key` from `process.env.ORACLE_OPERATOR_KEY` when present, sets `cache: "no-store"`, and retries idempotent GETs up to 3 times with backoff (build rule 8). Never logs the header.

**New** `/Users/kylekufuor/Projects/Ambitt Agents/client-portal/src/lib/oracle-fetch.ts` — same shape, injects `x-ambitt-portal-key` from `process.env.ORACLE_PORTAL_KEY`.

Mirror-copies, not shared imports: dashboard and client-portal deploy with Railway `rootDirectory` and cannot reach `../shared` (`project_railway_root_dir`). Two ~30-line files is the correct cost; do **not** create a `shared/` module for this.

**Changed — dashboard, mechanical `fetch(` → `oracleFetch(`:**
- `dashboard/src/app/(dashboard)/agents/actions.ts` (the `post`/`patch` helpers — one edit covers 6 actions)
- `dashboard/src/app/(dashboard)/agents/page.tsx` (approve/reject)
- `dashboard/src/app/(dashboard)/agents/[id]/page.tsx`
- `dashboard/src/app/(dashboard)/clients/[id]/page.tsx`
- `dashboard/src/app/(dashboard)/agents/create/actions.ts`
- `dashboard/src/app/(dashboard)/agents/create/page.tsx`
- `dashboard/src/app/(dashboard)/activity/page.tsx`
- `dashboard/src/app/(dashboard)/prospects/[id]/prd/page.tsx`, `prospects/[id]/quote/page.tsx`
- all 13 `dashboard/src/app/api/**/route.ts` proxies (builds, improvements, prospects, agents/[id]/dry-run)

**Two live bugs to fix in the same pass** (both introduced by `75089c9`, both currently mis-recording operator actions as client actions):
- `dashboard/src/app/(dashboard)/agents/[id]/page.tsx` line ~183 — `agentAction` POSTs `/agents/:id/:action` with **no body**, so `resolveControlRequester` returns `"client"`. The agent-detail Pause button records a client pause and its Resume cannot lift a system halt. Route it through the `actions.ts` operator helpers.
- `dashboard/src/app/(dashboard)/clients/[id]/page.tsx` line ~32 — identical bug.

**Also fix:** those two files plus `agents/create/actions.ts`, `agents/create/page.tsx`, and `agents/[id]/agent-tabs.tsx` default to `https://ambitt-agents-production.up.railway.app`, which is a dead Railway-edge 404 (`reference_oracle_url`). Centralising on `oracleBase()` with the correct default fixes a latent breakage. **Pre-flight for Kyle: confirm `ORACLE_URL` is actually set on the Dashboard service — if it is not, several operator buttons are already hitting a dead host today.**

**Changed — client-portal**, same mechanical swap in all 14 `src/app/api/agents/**/route.ts` proxies, plus `quotes/[token]/{route,approve,deny}.ts`, `proposals/[token]/approve/route.ts`, `api/onboard/**`, `api/composio/catalog/route.ts`. Send the portal key on all of them — public routes ignore it, and a blanket rule beats per-route reasoning. `src/lib/agent-auth.ts` keeps `verifyAgentOwnership` unchanged; `oracleUrl()` is superseded by `oracle-fetch.ts` (leave the export, re-point it).

**Changed** `/Users/kylekufuor/Projects/Ambitt Agents/oracle/cli.sh` — every `curl` gains `-H "x-ambitt-operator-key: ${ORACLE_OPERATOR_KEY}"`, plus a startup check that warns (does not exit) when the variable is empty. Kyle exports it in his own shell. Also fix line 25's dead default URL.

**Deploy:** Dashboard + Client Portal only. Oracle is still in observe mode with no keys, so the headers are sent and ignored. Zero behaviour change.

---

### Step 4 — Turn it on (two Railway variable changes, no code deploy)

**4a.** Kyle sets `ORACLE_OPERATOR_KEY` and `ORACLE_PORTAL_KEY` on the **Oracle** service (same values as on Dashboard/Portal). Redeploy Oracle. Mode is still `observe`, so Oracle now *validates* every header and logs `kind: "operator" | "portal"` — but rejects nothing.

**This is the proof gate.** Kyle clicks through the dashboard (Pause, Resume, Reduce cadence, Stop, Pause-all, Approve, Reject) and the portal (Pause, Resume). Every corresponding Oracle log line must read `kind: "operator"` / `kind: "portal"` and `wouldAllow: true`. If any reads `kind: "none"`, a caller was missed or a key was typo'd — fix it before 4b. **This is the answer to Devon's flag: enforcement is not flipped until the logs prove 100% of real traffic already carries a valid key.**

**4b.** Kyle sets `CONTROL_AUTH_MODE=enforce` on Oracle. Enforcement live.

**Rollback:** set `CONTROL_AUTH_MODE=observe`. One non-secret variable, ~60s, no code deploy, no risk of a partially-reverted state.

---

### Step 5 — Dashboard browser→Oracle calls become server proxies

These run in the browser via `NEXT_PUBLIC_ORACLE_URL` and therefore **cannot** carry the operator key (that would ship the secret to every visitor). They will 403 the moment step 4b lands, so this step must ship **before** 4b or these features stay broken.

Convert to Next server routes that call `oracleFetch`:

| Browser call site | Hits | New proxy |
|---|---|---|
| `agent-tabs.tsx` ~line 260 | `POST /agents/:id/documents` | `dashboard/src/app/api/agents/[id]/documents/route.ts` |
| `agent-tabs.tsx` ~line 422 | `PATCH /agents/:id/schedule` | `dashboard/src/app/api/agents/[id]/schedule/route.ts` |
| `create-agent-form.tsx` ~236 | `GET /composio/auth-scheme/:appName` | `dashboard/src/app/api/composio/auth-scheme/[appName]/route.ts` |
| `create-agent-form.tsx` ~258 | `GET /composio/connections/:clientId` | `dashboard/src/app/api/composio/connections/[clientId]/route.ts` |
| `create-agent-form.tsx` ~275 | `POST /composio/connect` | `dashboard/src/app/api/composio/connect/route.ts` |
| `create-agent-form.tsx` ~351 | `POST /composio/connect-apikey` | `dashboard/src/app/api/composio/connect-apikey/route.ts` |

Each proxy is behind the dashboard's Supabase + `ADMIN_EMAIL` middleware, so it is already operator-gated at the edge. `NEXT_PUBLIC_ORACLE_URL` should then be deleted from the Dashboard service — nothing in the dashboard browser bundle should know Oracle's address.

Note `agent-tabs.tsx` currently defaults to the dead `ambitt-agents-production` host, so the Documents-upload and Schedule buttons are likely already broken in prod unless `NEXT_PUBLIC_ORACLE_URL` is set. This step fixes that too.

Read `dashboard/node_modules/next/dist/docs/` before writing the route handlers — per `dashboard/AGENTS.md`, this Next version's route-handler conventions differ from training data (note the existing files use `RouteContext<"/api/...">` and `await ctx.params`).

---

### Step 6 — Webhook signature verification (separate ship, own observe mode)

Highest-severity item in the inventory (`/webhooks/email-inbound`), and the riskiest change in the plan, so it ships on its own after the control-plane work is green.

**`POST /webhooks/email-inbound`** — currently sits *below* `express.json()` and reads the parsed body. Svix verification needs the exact raw bytes, so the route must move **above** `express.json()` and switch to `express.raw({ type: "application/json" })`, then `JSON.parse` the verified buffer. Everything downstream of `const event = req.body` is unchanged.

Mandatory rollout guard: verify, log `verified: true|false`, and **do not reject** until the logs show real Resend traffic verifying. Gate on `INBOUND_WEBHOOK_MODE=observe|enforce`, same pattern as step 4. Breaking this route means all inbound email dies — and "real emails never ran" is an outage we have already lived through (`project_inbound_mx_and_agent_address`).

Resend signs per-endpoint, so this needs its **own** secret (`RESEND_INBOUND_WEBHOOK_SECRET`), distinct from `RESEND_WEBHOOK_SECRET`. Neither is currently set on Railway.

**`POST /webhooks/sms`** and **`POST /webhooks/whatsapp`** — add Twilio `X-Twilio-Signature` validation (`twilio.validateRequest` with `TWILIO_AUTH_TOKEN` and the exact public URL). Same observe-then-enforce gate. While in `/webhooks/whatsapp`, replace `from.includes(kyleNumber)` with an exact E.164 comparison.

Check the Twilio docs before writing the validation — the signature is computed over the full public URL including protocol and any query string, and Railway's proxy affects what Express reports (`app.set("trust proxy", 1)` may be required). Do not improvise this from memory.

---

## 5. Kyle's action items (he performs all of these; no agent reads or writes a secret value)

**Generate — in Kyle's own terminal, output never pasted into an agent session:**
```
openssl rand -hex 32     # → ORACLE_OPERATOR_KEY
openssl rand -hex 32     # → ORACLE_PORTAL_KEY   (must differ)
```

**Set, in this order:**

| # | Service | Variable | Value | When |
|---|---|---|---|---|
| 1 | Dashboard | `ORACLE_OPERATOR_KEY` | key A | after step 3 code lands |
| 2 | Dashboard | `ORACLE_URL` | `https://oracle-production-c0ff.up.railway.app` | verify it is set; several buttons already 404 without it |
| 3 | Client Portal | `ORACLE_PORTAL_KEY` | key B | after step 3 code lands |
| 4 | Oracle | `ORACLE_OPERATOR_KEY` | key A | step 4a |
| 5 | Oracle | `ORACLE_PORTAL_KEY` | key B | step 4a |
| 6 | Oracle | `CONTROL_AUTH_MODE` | `enforce` | step 4b, **only after the 4a logs are clean** |
| 7 | Oracle | `EXTENSION_ORIGIN_ALLOWLIST` | `chrome-extension://<id>` | optional; unset = today's behaviour |
| 8 | Oracle | `RESEND_INBOUND_WEBHOOK_SECRET` | from Resend dashboard | step 6 |
| 9 | Oracle | `RESEND_WEBHOOK_SECRET` | from Resend dashboard | outstanding from the email-observability work |

**Local shell (Kyle only), for `oracle/cli.sh`:** `export ORACLE_OPERATOR_KEY=…`

**Do not** put either key in `NEXT_PUBLIC_*` — it would be published in the browser bundle. The plan deliberately makes the CORS header allowlist reject these headers so this failure mode is structurally blocked.

Kyle should also add `ORACLE_OPERATOR_KEY`, `ORACLE_PORTAL_KEY`, `CONTROL_AUTH_MODE` to the env list in `CLAUDE.md` (documentation only, names not values).

---

## 6. Risk map

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Lockout during a runaway** — key misconfigured, Kyle cannot hit `pause-all` | Low | Fail-open on misconfiguration + one-variable `CONTROL_AUTH_MODE=observe` rollback. Kyle also retains direct DB access. |
| **Merge conflict with the concurrent engineer** | Medium | Step 2 touches `oracle/index.ts` only; the engineer is in `scheduler.ts`/`monitor.ts`/`spike-monitor.ts`. Step 3/5 touch `dashboard/**` and **must land after** their work — sequence, do not parallelise. |
| **Classifier drift** — new route added later is silently misclassified | Medium | Default-deny means a new route is operator-only, i.e. fails *closed* and loudly, not open. The drift test in `control-auth.test.ts` asserts a class for every route in the inventory. |
| **Missed caller** — some server-side call site not converted → 403 in prod | Medium | Step 4a observe-mode logs catch it *before* enforcement; that is the entire point of the extra step. |
| **`/mcp/builder` locked while Fable is enabled** | Low today | Funnel is behind `FABLE_FUNNEL_ENABLED` (off). When switching on, thread the key via `mcp_toolset.headers` in `scripts/seed-fable-agents.ts`. Recorded here so it is not rediscovered at 2am. |
| **Chrome extension CORS break** | Low | `EXTENSION_ORIGIN_ALLOWLIST` unset falls back to today's prefix behaviour. The Mac-mini worker is a Node process and sends no Origin, so CORS never applies to it. |
| **Step 6 kills inbound email** | Medium if rushed | Own ship, own observe-mode flag, own verification. Do not bundle with steps 1–5. |
| **Railway rootDirectory mirrors** | Low | `oracle-fetch` helpers are deliberately duplicated per service, not shared. No `prisma/schema.prisma` change in this plan — **no DB migration, no client regeneration**. |
| **Kubernetes** | None | Header-based auth is stateless. `auth-abuse.ts` is per-replica advisory only and is documented as such. No sticky sessions, no shared in-process state on the auth path. |

---

## 7. Verification plan

### Unit tests (green = exits 0, prints PASS lines, house style)

```
node_modules/.bin/tsx oracle/lib/control-auth.test.ts
node_modules/.bin/tsx oracle/lib/cors-origin.test.ts
node_modules/.bin/tsx oracle/lib/auth-abuse.test.ts
node_modules/.bin/tsx oracle/lib/pause-control.test.ts
```

- `control-auth.test.ts`: every route in §3 asserted to its class (the table doubles as the inventory); unknown path → `"operator"`; trailing-slash + method-case normalisation; `/agents/pause-all` never matches `/agents/:id/pause`; `identifyCaller` for missing / blank / wrong-length / wrong-value / correct / both-keys; the full 3×3 `authVerdict` matrix; constant-time compare returns `false` on length mismatch without throwing.
- `pause-control.test.ts` additions: `resolveAuthority("portal", {by:"operator"})` → `"client"`; `resolveAuthority("operator", {by:"operator"})` → `"operator"`; `resolveAuthority("none", {by:"operator"})` → `"operator"` (legacy/observe path preserved).
- `cors-origin.test.ts`: `https://ambitt.agency.evil.com` rejected; `https://evil-railway.app.io` rejected; `https://localhost.evil.com` rejected; `https://dashboard.ambitt.agency` accepted; extension allowlist set → only the listed id accepted; unset → any `chrome-extension://` accepted.

### Live curl checks (Kyle runs; `$OPK`/`$PPK` come from his own shell, never echoed)

```sh
ORACLE=https://oracle-production-c0ff.up.railway.app
AID=<a real agent id>

# 1. posture
curl -s "$ORACLE/health" | jq .controlAuth                       # → "enforce"

# 2. unauthenticated operator route → 403
curl -sfi -X POST "$ORACLE/agents/pause-all" | head -1            # → HTTP/2 403
curl -si -X POST "$ORACLE/agents/$AID/resume" \
  -H 'content-type: application/json' -d '{"requester":"operator"}' | head -1   # → 403
curl -si -X POST "$ORACLE/agents/$AID/run" | head -1              # → 403
curl -si "$ORACLE/fleet" | head -1                                # → 403

# 3. wrong key → 403 (and the response body must NOT name the expected header)
curl -si -X POST "$ORACLE/agents/pause-all" -H "x-ambitt-operator-key: nope" | head -1   # → 403

# 4. correct operator key → 200
curl -si -X POST "$ORACLE/agents/$AID/pause" -H "x-ambitt-operator-key: $OPK" \
  -H 'content-type: application/json' -d '{"by":"operator"}'      # → 200 pausedBy:"operator"
curl -si -X POST "$ORACLE/agents/$AID/resume" -H "x-ambitt-operator-key: $OPK" \
  -H 'content-type: application/json' -d '{"requester":"operator"}'  # → 200 status:"active"

# 5. portal key CANNOT escalate — the headline assertion
curl -si -X POST "$ORACLE/agents/$AID/pause" -H "x-ambitt-portal-key: $PPK" \
  -H 'content-type: application/json' -d '{"by":"operator"}'      # → 200 pausedBy:"CLIENT"
curl -si -X POST "$ORACLE/agents/pause-all" -H "x-ambitt-portal-key: $PPK" | head -1   # → 403

# 6. portal key cannot widen the seatbelts
curl -si -X PATCH "$ORACLE/agents/$AID/config" -H "x-ambitt-portal-key: $PPK" \
  -H 'content-type: application/json' -d '{"safetySensitivity":"relaxed"}' | head -1   # → 403

# 7. public routes unchanged
curl -si "$ORACLE/health" | head -1                               # → 200
curl -si -X POST "$ORACLE/webhooks/stripe" -d '{}' | head -1      # → 400 (missing signature), NOT 403
curl -si "$ORACLE/composio/catalog" | head -1                     # → 200

# 8. cross-origin read is refused
curl -si "$ORACLE/tools/catalog" -H "Origin: https://ambitt.agency.evil.com" \
  | grep -i access-control-allow-origin                           # → no header
```

### UI click-through ("green" means every one of these passes)

- Dashboard FLEET-CONTROL panel: Pause, Resume, Reduce cadence, Stop, and **Pause all active** all succeed, and the Agents page reflects the new state.
- Dashboard agent-detail page: Pause records `pausedBy: "operator"` (this is the bug fix — verify it in the DB or the row badge, not just the button).
- Dashboard: Approve and Reject a `pending_approval` agent.
- Dashboard: upload a document and change a schedule (step 5 proxies).
- Portal (signed in as the owning client, e.g. McQuizzy → `kylegacc@gmail.com`): Pause succeeds; Resume of that same client pause succeeds.
- Portal: against an agent the *operator* paused, Resume returns 403 with the friendly copy — the system/operator halt still holds.
- Inbound email still works end-to-end: reply to an agent email, get a response. **Re-check this after step 6.**

### Regression watch

Existing tests that must stay green: `oracle/lib/pause-control.test.ts`, `intent-classify.test.ts`, `inbound-classify.test.ts`, `throttle.test.ts`, `shared/seatbelts.test.ts`, `shared/spike-detect.test.ts`, `shared/mfa-relay.test.ts`.

---

## 8. Deferred, deliberately

1. **Oracle verifies the Supabase JWT itself** (removes the portal from the trust chain) — the correct multi-tenant end-state. Phase 4.
2. **Durable rate limiting** on public spend routes (`/chat/*`, `/extension/tasks/:taskId/step`, `/onboarding/prospects/:id/event`, `/extension/pair`) — needs Redis or Railway edge. Revisit at K8s.
3. **`GET /composio/auth-scheme/:appName`** — unauthenticated proxy to Composio on our API key. Quota abuse only.
4. **Prospect-flow id enumeration** — a documented accepted tradeoff (`oracle/index.ts` ~2356). Unchanged.
5. **Key rotation** — with one operator key there is no zero-downtime rotation. If Kyle wants it, `ORACLE_OPERATOR_KEY_NEXT` accepted alongside the primary is a ~10-line follow-up. **Policy question for Kyle: is rotation a requirement, and on what cadence?**
6. **Audit trail** — control actions currently log to Winston but do not write an `OracleAction` row for pause/resume/kill. Worth doing; out of scope here.

---

## 9. Policy gaps for Kyle (via the CTO)

- **Fail-open vs fail-closed on misconfiguration** (§2d). Plan says fail-open, prioritising Kyle's ability to hit the emergency stop over closing the hole. Kyle's call.
- **Key rotation cadence** (§8.5).
- **Client-facing copy** when an authenticated portal action is refused (e.g. a client trying to change `safetySensitivity`). Not invented here.
