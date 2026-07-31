# A2P 10DLC — paste-ready submission sheet

**You file this. I can't**, and not for want of the details: brand registration is an
attestation made with your Twilio credentials, under your legal entity, that the traffic
complies with carrier rules. Campaign vetting is **$15, charged whether it is approved or
rejected**, so first-try approval is worth the ten minutes of checking below.

Everything here is drawn from `a2p-10dlc-2fa-relay.md` (researched 23 Jul 2026) and from what
the product actually does today, verified 31 Jul.

---

## Before you open the console — the three things that fail small brands

| Check | Status | Why it matters |
|---|---|---|
| Legal name matches IRS records **exactly** | **YOU MUST CONFIRM** | #1 brand-stage rejection. Use the name on the CP-575 letter — my notes say **Kufgroup LLC**, not "Ambitt Agents". Check the letter, not memory. |
| `PrivacyPolicyUrl` + `TermsAndConditionsUrl` live and public | **DONE** — both return 200 | Mandatory since 30 Jun 2026; campaigns without them are rejected at review. |
| Privacy policy states mobile/SMS data is never shared or sold | **DONE** | Verbatim on the live page. Third-party-hosted policies get rejected; ours is first-party. |
| Opt-in described matches the real one | **DONE (fixed 31 Jul)** | The portal now records an unticked-by-default consent box with a timestamp, which is what the policy claims. It did not until today. |

---

## Field-by-field

**Business / Brand**

| Field | Value |
|---|---|
| Legal company name | `Kufgroup LLC` — **verify against CP-575** |
| Brand name (display) | `Ambitt Agents` |
| EIN / Tax ID | *(from your CP-575)* |
| Business type | Private for-profit / LLC |
| Registered address | *(as filed with the IRS)* |
| Website | `https://www.ambitt.agency` |
| Support email | `support@ambitt.agency` |
| Vertical | Professional services / Technology |

**Brand tier:** Low-Volume Standard (~$4.50 brand). Correct for tens of messages a month, and
the brand is reusable — each future campaign is +$15, no new brand.

**Campaign:** Low Volume Mixed.
Chosen over the "2FA" use case deliberately: the relay is account-notification traffic *plus*
verification codes, and a mixed campaign covers both without a second registration later.

---

## Campaign fields (paste these)

**Campaign description**
```
Ambitt Agents provides AI assistants that perform business tasks for small-business
clients. When an assistant signs in to a business tool on a client's behalf and that
tool sends a one-time verification code, we text the code request to the client so
they can forward the code back and the sign-in can complete. We also send occasional
account notifications about the client's own assistant. Messages go only to the
client who created the account and opted in. No marketing or promotional messages
are sent on this campaign.
```

**How do end users consent?**
```
Consent is collected in the client's own authenticated portal at
portal.ambitt.agency, on the Email setup page, where the client enters their mobile
number and ticks an unchecked consent box reading: "I agree to receive
login-verification texts from Ambitt Agents at this number. Message frequency
varies, and message and data rates may apply. Reply STOP to opt out or HELP for
help." The consent and its timestamp are stored against the client record. The box
is never pre-checked. Only the account holder can reach this page, and only after
signing in with their own credentials. No numbers are collected anywhere else, and
none are purchased, rented, or imported.
```

**Sample messages** — at least one must carry STOP/HELP.
```
1) Arthur here. CoStar just sent you a verification code. Text back just the code
   and I'll finish signing in. Reply STOP to opt out, HELP for help.

2) Ambitt Agents: your assistant Arthur is paused and will not send anything until
   you resume him. Reply STOP to opt out, HELP for help.
```

**Opt-out / help**
```
STOP — we stop texting immediately and the assistant reverts to asking by email.
HELP — replies with support@ambitt.agency.
```

**URLs**
```
Privacy: https://www.ambitt.agency/privacy
Terms:   https://www.ambitt.agency/terms
```

---

## Money and time

| | |
|---|---|
| Brand (LV Standard) | ~$4.50 one-time |
| Campaign vetting | **$15 one-time, non-refundable, charged even if rejected** |
| Campaign monthly | ~$1.50/mo |
| Per message, all-in | ~$0.012–0.016 |
| Trust profile | 72 hours or more |
| Brand approval | minutes if the EIN matches; 7+ business days if it does not |
| **Campaign vetting** | **10–15 days** per Twilio's current guidance — the long pole |
| **Realistic total** | **1–3 weeks** |

---

## The faster option, worth doing in parallel

A **verified toll-free number** is **$0 to register and ~3–5 business days**. Same EIN
requirement (mandatory since 17 Feb 2026), and per-message carrier fees are within $0.0005 of
10DLC, so it costs essentially nothing extra.

The only real downside is that it is a *different number* — which for a relay that texts one
client a login code is not a downside at all.

**Recommendation: file both.** Toll-free unblocks Casey's CoStar sign-ins next week; 10DLC
lands in two to three and becomes the reusable platform asset.

---

## After approval — one flag flips it on

Set `TWILIO_AUTH_TOKEN` on the Oracle service in Railway. Until then `smsConfigured()` returns
false and the relay keeps choosing email no matter what number a client has saved. Prod
currently has `TWILIO_ACCOUNT_SID` and `TWILIO_SMS_NUMBER` only.
