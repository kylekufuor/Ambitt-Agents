# Toll-free verification — how it gets filed

**Number is bought.** `(833) 853-6941`, SID `PN1cf3a50e307932f5469badc525224f1d`, $2.15/mo.
Verification itself is $0 and takes ~3–5 business days.

**Filed by API, not the console.** See below for why. The submission lives in
`scripts/tollfree-verify.ts` — that file *is* the filing, and it is the thing to edit if any
declared value changes.

---

## Why not the console

The console's "Registration Details" step is a cross-origin Persona embed
(`inquiry.withpersona.com/widget`). It mounts and sits on top of the page, but nothing outside
it can read or click into it — no content script reaches it and it does not appear in the
accessibility tree. Persona itself is reachable (the domain responds fine), so this is not a
blocked-resource problem; the frame is simply opaque to anything but a human at the keyboard.

Twilio's REST API accepts the identical submission, with the considerable advantage that every
declared value sits in a diff instead of being retyped into a form nobody can audit afterwards.

## How to file it

```bash
npx tsx scripts/tollfree-verify.ts
```

Dry run — prints the exact payload, sends nothing. Read it; it is an attestation.

```bash
TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... npx tsx scripts/tollfree-verify.ts --submit
```

Submits. Credentials come from the environment for that one command; the repo `.env` declares
both keys but holds **no values** (the live pair is on the Railway Oracle service → Variables).

Before filing anything it GETs the number and aborts unless the SID really is `+18338536941`.
The result emails `support@ambitt.agency`; poll it any time with:

```bash
TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... npx tsx scripts/tollfree-verify.ts --status HH...
```

---

## What is declared, and why

| Field | Value | Why this one |
|---|---|---|
| `BusinessName` | `KUFGROUP LLC` | Legal name from the CP-575, **not** the brand. Name/EIN mismatch is the #1 rejection. |
| `DoingBusinessAs` | `Ambitt Agents` | Where the brand name belongs. |
| `BusinessRegistrationNumber` | `87-1733235` (EIN) | Mandatory for toll-free since 17 Feb 2026. |
| Address | `1801 N Pearl St #1908, Dallas, TX 75201` | **Kyle's call.** The CP-575 shows the older Richardson address; vetting matches IRS records, so a mismatch here is the most likely rejection cause. Change it in the script if the letter should win. |
| `UseCaseCategories` | `TWO_FACTOR_AUTHENTICATION`, `ACCOUNT_NOTIFICATIONS` | Both, because the traffic genuinely is both. Declaring only 2FA would leave sample #2 unaccounted for. |
| `OptInType` | `WEB_FORM` | It is a consent checkbox in an authenticated portal. |
| `OptInImageUrls` | `www.ambitt.agency/compliance/sms-opt-in-screen.png` | The real consent screen. See below. |
| `MessageVolume` | `10` | Lowest bucket. Honest and low; an inflated figure on a brand-new toll-free number invites scrutiny it does not need. |
| `OptInKeywords` | `START`, `UNSTOP` | True today with no work on our side — Twilio handles toll-free STOP/UNSTOP at the network level and it cannot be disabled. |
| `PrivacyPolicyUrl` / `TermsAndConditionsUrl` | live `/privacy`, `/terms` | Mandatory since 30 Jun 2026. Both carry the never-shared-or-sold clause. |

## The opt-in evidence problem

Carriers require opt-in documentation **at an external URL**, and ours is a checkbox behind a
client login. That is exactly the "unverifiable opt-in" that gets toll-free registrations
rejected.

`https://www.ambitt.agency/sms-opt-in` is the answer: a public page reproducing the real consent
screen as a screenshot, the verbatim checkbox wording, both sample messages with their STOP/HELP
lines, and the never-shared-or-sold clause. Source: `website/app/sms-opt-in/page.tsx`.

**If the portal's consent copy changes, that page, its screenshot, and this filing all change
with it.** A mismatch between what we declared and what a client actually sees is both a
rejection risk and a false published claim.

---

## One thing that is not yet true

`HelpMessageSample` declares the HELP reply as:

> Ambitt Agents: we text login-verification codes to the mobile number on your account.
> Support: support@ambitt.agency. Reply STOP to opt out.

Today, HELP falls through to Twilio's own default help language — we do not set it. STOP and
UNSTOP *are* genuinely handled at the network level, so those are fine. To make the HELP text
match what we declared, set custom HELP copy via Advanced Opt-Out on a Messaging Service
containing the number. Worth doing; not a blocker for submission.

---

## After it is approved

1. Point the number's **A MESSAGE COMES IN** webhook at
   `https://oracle-production-c0ff.up.railway.app/webhooks/sms` (HTTP **POST**).
   Without this, Casey's reply goes nowhere and the code never reaches Arthur.
2. Update `TWILIO_SMS_NUMBER` on the Oracle service to `+18338536941`.
   Not before — an unverified toll-free number is fully blocked, so switching early turns a
   slow-but-working email relay into a dead one.
3. Casey adds his mobile on the portal's Email setup page and ticks consent.

Signature verification is already in **enforce** mode, so the webhook only accepts genuinely
Twilio-signed requests — confirmed live: an unsigned POST returns 401.

## If it is rejected

There is a **7-day priority-resubmit window**. The usual causes, in order: EIN/legal-name
mismatch (see the address note above), opt-in a reviewer cannot verify (hence `/sms-opt-in`),
and sample messages without STOP/HELP. `--status` prints Twilio's rejection reason verbatim.

---

## A2P 10DLC, in parallel

Still worth filing — see `a2p-10dlc-2fa-relay.md` and `a2p-submission-sheet.md`. ~$19.50 up
front plus $1.50/mo, 1–3 weeks, and the brand is reusable for every future campaign. Toll-free
unblocks Casey next week; 10DLC becomes the platform asset.
