# A2P 10DLC registration for the 2FA-relay SMS use case

**Rex — Research Analyst, Ambitt Agents · 2026-07-23**
Case: Kufgroup LLC (EIN, d/b/a Ambitt Agents / AmbittMedia, ambitt.agency). One Twilio US local number (+1 817 809 7106, Grapevine TX). Two-way transactional "2FA relay" — platform texts a client "reply with the verification code CoStar just sent you," client replies with a ~6-digit code. <10 US recipients (consented paying clients), tens of messages/month.

---

## Verdict (summary)

Register a **Low-Volume Standard brand + one Low Volume Mixed campaign** on the existing local number. Registration is mandatory at ANY volume — unregistered 10DLC has been fully blocked since Aug 31, 2023 (error 30034), and Twilio still bills you for the blocked attempts. Cost: ~**$19.50 one-time + $1.50/mo + ~$0.012–0.016/msg all-in**. Expect **~1–3 weeks** end-to-end, dominated by campaign vetting (Twilio's docs currently say reviews take 10–15 days). If SMS is needed live sooner, a **verified toll-free number** is the faster/cheaper stopgap ($0 registration, ~3–5 business days) but it's a different number and no longer has any per-message fee advantage. Details, prerequisites, and the ready-to-paste submission text below.

---

## 1. Is unregistered 10DLC blocked? (Yes — no volume exemption)

- Since **Aug 31, 2023**, all SMS/MMS to US numbers from +1 10DLC numbers must belong to an approved A2P campaign. Unregistered traffic is **100% blocked** with [error 30034](https://www.twilio.com/docs/api/errors/30034); Twilio's [full-blocking changelog](https://www.twilio.com/en-us/changelog/-u-s--a2p-10dlc--full-blocking-of-traffic-sent-from-unregistered) and [shutdown FAQ](https://support.twilio.com/hc/en-us/articles/14910496447771-Shutdown-of-Unregistered-10DLC-Messaging-FAQ) confirm there is no low-volume exemption.
- The FAQ notes **Twilio messaging rates still apply to blocked messages** — you pay for sends that never deliver.
- Pending-but-not-yet-approved campaigns are also blocked (same 30034). The escape hatches Twilio itself lists: toll-free, short code, or Twilio Verify. Verify is send-only OTP delivery — it cannot receive the client's inbound code reply, so it does **not** fit our relay.

## 2. The right tier for an LLC with an EIN at tens of msgs/month

| Tier | Who it's for | One-time | Fits us? |
|---|---|---|---|
| **Sole Proprietor** | Individuals **without** an EIN; ~1,000 msgs/day cap | ~$4.50 brand + $15 vetting | **No** — Kufgroup LLC has an EIN; entities with a tax ID must not register Sole Prop |
| **Low-Volume Standard** | EIN businesses sending **<6,000 segments/day** (~2,000/day T-Mobile cap) | **$4.50 brand + $15 campaign vetting** | **Yes** — we send tens/month |
| **Standard** | EIN businesses needing higher throughput / Trust Score | ~$46 ($4.50 brand + $41.50 secondary vetting) | Overkill; only buys throughput we'll never use |

Sources: Twilio [LV Standard changelog](https://www.twilio.com/en-us/changelog/us-a2p-10dlc-low-volume-standard-brand-registration-available-in-twilio-console) ($4 brand, <6,000 segs/day), [direct registration guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-standard-onboarding), [A2P overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) (throughput per brand type). TCR raised the brand fee $4→$4.50 and standard vetting $40→$41.50 on **Aug 1, 2025** (passthrough; [Aloware](https://aloware.com/blog/a2p-10dlc-fee-update-what-you-need-to-know-before-august-1-2025), [GoHighLevel fee table](https://help.gohighlevel.com/support/solutions/articles/155000005200-a2p-10dlc-messaging-fees-registration-monthly-and-carrier-costs) — GHL states these are unmarked passthrough charges).

### Exact recurring + per-message costs (Twilio direct, July 2026)

- **Monthly campaign fee:** Low Volume Mixed **$1.50/mo**; any standard use case incl. 2FA **$10.00/mo** ([SignalWire TCR fee mirror](https://developer.signalwire.com/guides/messaging/campaign-registry-pricing/), GHL table — both match TCR's schedule).
- **Campaign vetting:** **$15 one-time, non-refundable**, charged whether approved or rejected. Editing and resubmitting the *same* rejected campaign is normally not re-billed, but reviews by the secondary DCA / third-party vetting failures **can bill $15 again** ([Campaign Vetting FAQ](https://support.twilio.com/hc/en-us/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ), [troubleshooting doc](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns)). First-try approval is worth engineering for.
- **Base message price:** $0.0083 out / $0.0083 in per SMS segment ([Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)).
- **Carrier surcharges per SMS segment (10DLC, current Twilio table):** AT&T $0.0035 out / $0.0035 in; T-Mobile $0.0045 out / $0.0025 in; Verizon $0.0045 out / $0.007 in; US Cellular $0.005 out / $0.0025 in; all others ~$0.004 out (same pricing page).
- **Our real spend at ~40 msgs/mo (half inbound):** roughly **$0.50/mo in message costs + $1.50/mo campaign fee**. The registration economics dwarf the traffic.

## 3. Realistic timelines (July 2026)

| Step | Time |
|---|---|
| Customer/Trust Profile approval (Twilio) | "72 hours or more" per Twilio's [registration guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-standard-onboarding) |
| Brand approval (TCR, automated EIN match) | "typically within a few minutes"; manual review "seven business days or more" if the EIN data mismatches |
| **Campaign vetting** | Twilio docs currently state reviews are taking **10–15 days** "due to an increase in campaign submissions" (same guide + [Vetting FAQ](https://help.twilio.com/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ)); practitioner/ISV reports commonly cite 5–10 days; Twilio says contact support if >10 days |

**Realistic total: ~1–3 weeks**, and the campaign queue is the long pole.

### What makes vetting fail or drag for small brands

1. **EIN mismatch** — legal name/address must match IRS records *exactly* ("Kufgroup LLC" as on the CP-575, not "Ambitt Agents"). #1 brand-stage failure.
2. **Website problems** — URL unreachable, under construction, password-protected, or doesn't visibly match the brand ([Twilio approval best-practices](https://www.twilio.com/en-us/blog/insights/best-practices/improving-your-chances-of-a2p10dlc-registration-approval), [GHL rejection catalog](https://help.gohighlevel.com/support/solutions/articles/155000007572-a2p-campaign-rejections-required-fixes-vetting-errors)). ambitt.agency must render publicly and mention the legal entity somewhere (footer is fine).
3. **Missing SMS language on the site** — the page where numbers are collected needs visible consent language, and the **privacy policy must state mobile numbers/SMS consent are never shared or sold to third parties for marketing**. Third-party-hosted privacy policies get rejected.
4. **NEW as of June 30, 2026:** campaign submissions **must include `PrivacyPolicyUrl` and `TermsAndConditionsUrl`** — both valid, publicly accessible — or they are "rejected during campaign review" ([Twilio changelog](https://www.twilio.com/en-us/changelog/a2p-10dlc-campaign-registration-will-require-privacy-policy-and-)). **We must publish ambitt.agency/privacy and ambitt.agency/terms before submitting.**
5. **Vague opt-in description** — must say exactly where/how consent is captured; default-checked consent boxes are an instant fail.
6. **Sample-message problems** — missing, don't identify the brand, no STOP/HELP language in at least one sample, or content doesn't match the declared use case ([Salesmsg rejection codes](https://help.salesmessage.com/en/articles/12148803-10dlc-rejection-codes-explanations)).

## 4. Use case choice: Low Volume Mixed over 2FA — and the draft submission

**Choose LOW_VOLUME (Low Volume Mixed), not 2FA.** Two reasons:

- **Content match.** TCR's 2FA use case is "Any authentication or account verification such as one-time-passcodes (OTP)" ([use-case list](https://support.twilio.com/hc/en-us/articles/1260801844470-List-of-campaign-use-case-types-for-A2P-10DLC-registration)) — vetters expect outbound samples *containing* codes ("Your code is 123456"). Our outbound messages **request** a code; the code arrives inbound. That sample/use-case mismatch is a documented rejection cause. Low Volume Mixed explicitly covers multiple low-volume use cases and absorbs the conversational relay plus any future account notifications.
- **Price.** $1.50/mo vs $10/mo — and it leaves room to add notification-type messages later without a second $15 + $10/mo campaign.

Declare sub-use-cases **2FA + Account Notification** inside the Low Volume Mixed campaign (the form asks). Answer "No" to: sending on behalf of a different company (we send on our own behalf), direct lending, age-gated content, embedded phone numbers. Answer "Yes" to embedded links only if we'll ever include portal links (safer: **No** for v1, plain text only).

### Draft submission text (paste-ready)

**Campaign description:**
> Kufgroup LLC (brand "Ambitt Agents", ambitt.agency) provides managed AI business-assistant services to a small number of subscribed business clients. This campaign sends low-volume, transactional, two-way account messages to our own paying clients who explicitly opted in during onboarding: (1) login-verification relay requests — when a client has authorized our service to access one of their own software accounts, we text the client asking them to reply with the one-time passcode that software provider sent to their phone, so the login they requested can be completed; (2) occasional account and service notifications. Volume is under 100 messages per month to fewer than 25 recipients, all existing customers. No marketing or promotional content is ever sent. Clients can reply STOP to opt out and HELP for assistance at any time.

**Sample messages:**
> 1. "Ambitt Agents: We're completing the account sign-in you authorized. Please reply with the 6-digit verification code your software provider just texted you. Msg&data rates may apply. Reply STOP to opt out, HELP for help."
> 2. "Ambitt Agents: Your assistant needs the one-time passcode from [Provider] to finish the login you requested today. Reply with the code when it arrives. Reply STOP to opt out."
> 3. "Ambitt Agents: Code received — the sign-in you authorized is complete. No further action needed. Reply HELP for help, STOP to opt out."
> 4. "Ambitt Agents: Heads up — your weekly account summary is ready and has been emailed to you. Reply HELP for help, STOP to opt out."

**Opt-in (how end users consent):**
> End users are exclusively our own paying business clients. During paid account onboarding at clients.ambitt.agency (authenticated client portal), each client provides their mobile number and checks an unchecked-by-default consent checkbox reading: "I agree to receive transactional account and verification text messages from Ambitt Agents (Kufgroup LLC) at the number provided. Message and data rates may apply. Message frequency varies. Reply STOP to unsubscribe, HELP for help." Consent is recorded with a timestamp in our database. Phone numbers are never purchased, shared, or used for marketing. Opt-in URL: https://clients.ambitt.agency (screenshot available). Privacy policy: https://ambitt.agency/privacy · Terms: https://ambitt.agency/terms

**Opt-in keywords/message (two-way campaign):** STOP handled by Twilio Advanced Opt-Out defaults; HELP response: "Ambitt Agents (Kufgroup LLC) — transactional account messages. Support: support@ambitt.agency. Msg&data rates may apply. Reply STOP to opt out."

**Prerequisites before hitting submit (build checklist):**
- [ ] Publish `ambitt.agency/privacy` (must include: mobile info/SMS consent never shared or sold to third parties or affiliates for marketing) and `ambitt.agency/terms` (SMS terms section: program description, frequency, msg&data rates, STOP/HELP).
- [ ] Add the SMS consent checkbox (unchecked) + timestamped consent record to the portal (fits the existing Communication Settings surface).
- [ ] "Kufgroup LLC" legal name + EIN + registered address exactly as on IRS records.
- [ ] Enable Advanced Opt-Out on the Messaging Service so STOP/HELP are auto-handled.

## 5. Toll-free comparison — faster and cheaper, but a different number

| | 10DLC (LV Standard + LVM) | Verified toll-free |
|---|---|---|
| Registration cost | ~$19.50 one-time + $1.50/mo | **$0** (verification is free) |
| Number cost | keep existing local ($1.15/mo) | new TF number ($2.15/mo) |
| Carrier fees/msg | AT&T $0.0035 / TMO $0.0045 / VZW $0.0045 | **essentially identical** — Twilio's current TF table matches 10DLC within $0.0005 ([pricing page](https://www.twilio.com/en-us/sms/pricing/us)) |
| Timeline | ~1–3 weeks (campaign queue 10–15 days) | **~3–5 business days** typical ([ISV reports](https://help.kajabi.com/en/articles/12695993-get-started-in-sms-with-a-toll-free-number-u-s-customers), [ACS](https://help.acst.com/en/ministryplatform/twilio-toll-free-verifications)); no published SLA; horror-story loops exist in reviews |
| Gotchas | everything in §3 | **BRN (EIN) mandatory since Feb 17, 2026** ([Twilio TFV policy](https://www.twilio.com/en-us/blog/toll-free-verification-policy)); unverified TF is fully blocked; rejected submissions get a 7-day priority-resubmit window ([console onboarding](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding)); it's a new number, not +1 817 809 7106 |

**Read:** TF wins on pure speed/cost *for this one use case*. 10DLC wins strategically — the LV Standard brand is a reusable platform asset (each future campaign is just +$15 + monthly fee, no new brand), it keeps the existing local number clients already see, and the fee gap is $19.50 once + $1.50/mo. Recommendation: **do the 10DLC registration now; add a verified TF number only if the relay must be live inside a week.**

---

*Method note: Twilio help-center articles (support.twilio.com) block direct fetching; fee figures there were cross-confirmed via Twilio's pricing page/changelogs plus two independent ISV passthrough tables (GoHighLevel, SignalWire) and Aloware's Aug-2025 TCR fee bulletin. All sources accessed 2026-07-23.*
