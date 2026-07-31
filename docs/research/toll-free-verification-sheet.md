# Toll-free verification — paste-ready

$0 to verify, ~3–5 business days. Your current number `+1 817 809 7106` is **local, not
toll-free**, so this is two steps: buy a TF number, then verify it.

EIN is mandatory for toll-free (since 17 Feb 2026). Have the CP-575 to hand.

---

## Step 1 — buy the number

Console → **Phone Numbers → Buy a number**, filter **Toll-Free**, capability **SMS**. ~$2.15/mo.

Do **not** change `TWILIO_SMS_NUMBER` on Railway yet. Leave the local number in place until the
new one is *verified* — an unverified toll-free number is fully blocked, so switching early
turns a slow-but-working email relay into a dead one.

## Step 2 — verify it

New console: **Numbers & senders** → the new number → "Finish setting up your number" → the
compliance prompt. Legacy: Active Numbers → the number → **Regulatory Information** →
"Verify this toll free number."

---

## The fields

| Field | Value |
|---|---|
| Business name | `Kufgroup LLC` — **verify against the CP-575**, this is the #1 rejection |
| Business website | `https://www.ambitt.agency` |
| Business address | *(as filed with the IRS)* |
| Contact email | `support@ambitt.agency` |
| Use case category | **Account Notification** (or "2FA / One-Time Passwords" if offered) |
| Estimated monthly volume | Low — tens of messages |
| Opt-in type | **Web form** (it is a consent checkbox in an authenticated portal) |

**Message volume note:** be honest and low. Inflated volume on a brand-new toll-free number
invites scrutiny.

---

## Opt-in description (paste)

```
Consent is collected inside the client's own password-protected portal at
portal.ambitt.agency, on the Email setup page. The client enters their mobile
number and ticks a consent checkbox that is never pre-checked, reading: "I agree
to receive login-verification texts from Ambitt Agents at this number. Message
frequency varies, and message and data rates may apply. Reply STOP to opt out or
HELP for help." The consent and its timestamp are stored against the client
record. Only the account holder can reach this page, after signing in with their
own credentials. No numbers are collected anywhere else, and none are purchased,
rented, or imported. Because the form sits behind authentication, a screenshot of
the consent screen is attached in place of a public URL.
```

**Attach the screenshot** of the consent card — the opt-in page is behind a login, so reviewers
cannot reach a URL, and "unverifiable opt-in" is the most common toll-free rejection.

## Sample messages (paste)

```
1) Arthur here. CoStar just sent you a verification code. Text back just the code
   and I'll finish signing in. Reply STOP to opt out, HELP for help.

2) Ambitt Agents: your assistant Arthur is paused and will not send anything until
   you resume him. Reply STOP to opt out, HELP for help.
```

## URLs

```
Privacy: https://www.ambitt.agency/privacy
Terms:   https://www.ambitt.agency/terms
```

Both are live and already carry the "mobile information is never shared or sold for marketing"
clause and the STOP/HELP and rate disclosures — verified on the deployed pages 31 Jul.

---

## After it is approved

1. Point the new number's **A MESSAGE COMES IN** webhook at:
   `https://oracle-production-c0ff.up.railway.app/webhooks/sms` (HTTP **POST**).
   Without this, Casey's reply goes nowhere and the code never reaches Arthur.
2. Update `TWILIO_SMS_NUMBER` on the Oracle service to the toll-free number.
3. Casey adds his mobile on Email setup and ticks consent.

Signature verification is already in **enforce** mode, so the webhook only accepts genuinely
Twilio-signed requests — confirmed live: an unsigned POST returns 401.

---

## If it is rejected

You get a **7-day priority-resubmit window**. The usual causes are an EIN/legal-name mismatch,
an opt-in that a reviewer cannot verify (hence the screenshot), and sample messages that do not
carry STOP/HELP.
