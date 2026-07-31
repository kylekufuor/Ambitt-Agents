import "dotenv/config";

/* ---------------------------------------------------------------------------
   Toll-free verification filing for (833) 853-6941, via Twilio's REST API.

   Why a script and not the console: the console's registration step is a
   cross-origin Persona embed. It mounts, but nothing outside it can see or
   click into it — so the form cannot be driven or even read programmatically.
   The API takes the identical submission, and has the considerable advantage
   that every declared value is reviewable in a diff instead of retyped into a
   form nobody can check afterwards.

   The payload below IS the filing. Read it as a legal attestation, not as
   config: every claim in it is one a carrier may check against what the
   product actually does, and a mismatch is what gets a registration rejected.
   If the portal's consent copy, the sample messages, or the opt-in page ever
   change, this file changes with them.

   Credentials are read from the environment and never printed. Dry-run is the
   default; submitting takes an explicit --submit.
   --------------------------------------------------------------------------- */

const API = "https://messaging.twilio.com/v1/Tollfree/Verifications";

/** The toll-free number being registered — from the console URL for the number. */
const TOLLFREE_PHONE_NUMBER_SID = "PN1cf3a50e307932f5469badc525224f1d";

/**
 * The filing.
 *
 * Field names are Twilio's, verbatim. Values are ours, and each one is chosen
 * against a specific rejection risk — see the notes.
 */
const PAYLOAD: Record<string, string | string[]> = {
  TollfreePhoneNumberSid: TOLLFREE_PHONE_NUMBER_SID,

  // Legal name, not brand name. Name/EIN mismatch against IRS records is the
  // single most common brand-stage rejection, so this must match the CP-575
  // exactly — "Ambitt Agents" is the d/b/a and belongs in DoingBusinessAs.
  BusinessName: "KUFGROUP LLC",
  DoingBusinessAs: "Ambitt Agents",
  BusinessType: "PRIVATE_PROFIT",
  BusinessRegistrationNumber: "87-1733235",
  BusinessRegistrationAuthority: "EIN",
  BusinessRegistrationCountry: "US",

  BusinessWebsite: "https://www.ambitt.agency",
  BusinessStreetAddress: "1801 N Pearl St",
  BusinessStreetAddress2: "#1908",
  BusinessCity: "Dallas",
  BusinessStateProvinceRegion: "TX",
  BusinessPostalCode: "75201",
  BusinessCountry: "US",

  NotificationEmail: "support@ambitt.agency",
  BusinessContactFirstName: "Kyle",
  BusinessContactLastName: "Kufuor",
  BusinessContactEmail: "support@ambitt.agency",

  // Both, deliberately. The traffic is genuinely two things — verification
  // codes and notices about the client's own assistant — and declaring only
  // 2FA would leave the second sample message unaccounted for.
  UseCaseCategories: ["TWO_FACTOR_AUTHENTICATION", "ACCOUNT_NOTIFICATIONS"],

  UseCaseSummary:
    "Ambitt Agents provides AI assistants that carry out business tasks for small-business clients. " +
    "When an assistant signs in to a business tool on a client's behalf and that tool sends a one-time " +
    "verification code, we text the client to ask for the code so the sign-in can complete. We also send " +
    "occasional notices about the client's own assistant. Messages go only to the client who created the " +
    "account and opted in. No marketing or promotional messages are sent from this number.",

  ProductionMessageSample:
    "Arthur here. CoStar just sent you a verification code. Text back just the code and I'll finish " +
    "signing in. Reply STOP to opt out, HELP for help.",

  // Consent is a checkbox in an authenticated portal, so a reviewer cannot
  // reach the real screen. /sms-opt-in is the public stand-in: the screenshot
  // of that exact screen, the verbatim consent wording, and the samples.
  // "Unverifiable opt-in" is the most common toll-free rejection.
  OptInType: "WEB_FORM",
  OptInImageUrls: ["https://www.ambitt.agency/compliance/sms-opt-in-screen.png"],

  // Honest and low. An inflated figure on a brand-new toll-free number invites
  // scrutiny it does not need — this relay texts a handful of clients a login
  // code and nothing else.
  MessageVolume: "10",

  // Toll-free STOP/UNSTOP is handled by Twilio at the network level and cannot
  // be disabled, so these are true today without any configuration on our side.
  OptInKeywords: ["START", "UNSTOP"],

  HelpMessageSample:
    "Ambitt Agents: we text login-verification codes to the mobile number on your account. " +
    "Support: support@ambitt.agency. Reply STOP to opt out.",

  PrivacyPolicyUrl: "https://www.ambitt.agency/privacy",
  TermsAndConditionsUrl: "https://www.ambitt.agency/terms",

  AdditionalInformation:
    "Opt-in evidence: https://www.ambitt.agency/sms-opt-in — this page reproduces the consent screen " +
    "(which sits behind a client login), the exact checkbox wording, and the message samples. " +
    "Consent wording, verbatim: \"I agree to receive login-verification texts from Ambitt Agents at this " +
    "number. Message frequency varies, and message and data rates may apply. Reply STOP to opt out or HELP " +
    "for help.\" The box is never pre-checked, and the consent and its timestamp are stored against the " +
    "client record. Only the account holder can reach that page, after signing in with their own " +
    "credentials. No numbers are purchased, rented, or imported, and none are collected anywhere else. " +
    "Second sample message: \"Ambitt Agents: your assistant Arthur is paused and will not send anything " +
    "until you resume him. Reply STOP to opt out, HELP for help.\" STOP and UNSTOP are handled by Twilio's " +
    "network-level toll-free opt-out.",
};

/**
 * Strip what a copy-paste adds: surrounding quotes and stray whitespace.
 *
 * This matters more than it looks. The account SID is interpolated into a URL
 * path, and a trailing newline or space becomes %0A/%20 there — which Twilio's
 * WAF rejects with an HTML "403 Request blocked" that never reaches Twilio and
 * reads exactly like a permissions problem. The value looks perfect in the
 * terminal, because the defect is invisible.
 */
function sanitize(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  // [\s\S] rather than . with the s flag — this file compiles under the repo's
  // pre-es2018 target, where that flag is a syntax error.
  const unquoted = /^(["'])[\s\S]*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
  return unquoted.trim();
}

/**
 * Is this the example text rather than a real value?
 *
 * Worth its own check. A placeholder that reaches Twilio does not fail
 * helpfully — "AC..." in a URL path reads as directory traversal, and the WAF
 * answers with an HTML 403 that looks like a permissions problem and is not.
 */
function looksLikePlaceholder(value: string): boolean {
  return /paste|your[_-]|here|example|xxxx|\.\.\.|^<.*>$/i.test(value);
}

/** Describe a malformed credential without ever echoing its value. */
function defectIn(name: string, raw: string | undefined, clean: string, shape: RegExp): string | null {
  if (!clean) return `${name} is empty.`;
  if (shape.test(clean)) return null;
  if (looksLikePlaceholder(clean)) {
    return `${name} is still the placeholder text, not the real value.`;
  }
  const notes: string[] = [`${name} is ${clean.length} characters and not the expected shape.`];
  if (raw && raw !== clean) notes.push("It had surrounding quotes or whitespace, which were stripped.");
  if (/\s/.test(clean)) notes.push("It still contains whitespace — re-copy it without a line break.");
  return notes.join(" ");
}

/**
 * The account that owns the number being registered. Not a secret — it is an
 * API username, and it is already visible in every console URL — so it lives
 * here beside the phone number SID rather than being retyped each run. Only
 * the auth token is a secret, and it is the only thing this script asks for.
 */
const ACCOUNT_SID = "ACCOUNT_SID_FROM_ENV";

/**
 * Ask for the auth token without echoing it.
 *
 * A prompt rather than an environment variable on the command line, because
 * every failed attempt at this so far has been the example text pasted
 * verbatim into a command the reader was meant to edit. Nothing to edit means
 * nothing to get wrong — and the secret stays out of shell history too.
 *
 * readline's _writeToOutput is private, but overriding it is the standard way
 * to suppress echo and it behaves correctly with backspace and ctrl-c.
 */
async function promptForToken(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "No auth token, and stdin is not a terminal so I cannot ask for one.\n" +
        "Set TWILIO_AUTH_TOKEN in the environment for this command."
    );
  }

  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const muteable = rl as unknown as { _writeToOutput: (s: string) => void };
  const write = muteable._writeToOutput.bind(rl);
  let muted = false;
  muteable._writeToOutput = (s: string): void => {
    if (!muted) write(s);
  };

  const answer = await new Promise<string>((resolve, reject) => {
    // On ctrl-D (or any closed input) rl.question simply never calls back, so
    // without this the promise never settles, the event loop empties, and the
    // process exits 0 having silently done nothing at all.
    rl.on("close", () => reject(new Error("\nCancelled — no token entered. Nothing was sent.\n")));
    rl.question("Twilio auth token (input hidden, paste and press return): ", resolve);
    muted = true;
  });
  rl.close();
  process.stdout.write("\n");
  return sanitize(answer);
}

let resolved: { sid: string; token: string } | null = null;

/** Resolve credentials once, prompting for the token only if we must. */
async function resolveCredentials(): Promise<void> {
  const rawSid = process.env.TWILIO_ACCOUNT_SID;
  const envSid = sanitize(rawSid);
  const sid = envSid && !looksLikePlaceholder(envSid) ? envSid : ACCOUNT_SID;

  const rawToken = process.env.TWILIO_AUTH_TOKEN;
  let token = sanitize(rawToken);
  let tokenSource: string | undefined = rawToken;

  if (!token || looksLikePlaceholder(token)) {
    if (token) console.log("\nTWILIO_AUTH_TOKEN is the placeholder text — ignoring it.");
    console.log("\nFind it at: Twilio Console → API keys & auth tokens → Primary auth token.\n");
    token = await promptForToken();
    tokenSource = token;
  }

  // Validate before anything is interpolated into a URL, so a bad value fails
  // here with a readable reason instead of as an opaque WAF block later.
  const problems = [
    defectIn("Account SID", rawSid, sid, /^AC[0-9a-fA-F]{32}$/),
    defectIn("Auth token", tokenSource, token, /^\S{20,}$/),
  ].filter((p): p is string => p !== null);
  if (problems.length) throw new Error(`\n${problems.join("\n")}\n\nNothing was sent.\n`);

  resolved = { sid, token };
}

function credentials(): { sid: string; token: string } {
  if (!resolved) throw new Error("Credentials were not resolved before use.");
  return resolved;
}

function authHeader(): string {
  const { sid, token } = credentials();
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/**
 * Headers for every Twilio call.
 *
 * The User-Agent identifies us in Twilio's request logs, which is worth having
 * when a submission needs chasing. It is NOT what fixes a CloudFront block —
 * that was tested, and Node's fetch reaches Twilio with or without it. A block
 * means the URL itself was malformed; see sanitize().
 */
function twilioHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: authHeader(),
    "User-Agent": "ambitt-agents-tollfree-verify/1.0",
    Accept: "application/json",
    ...extra,
  };
}

/**
 * Turn a Twilio response into something worth reading.
 *
 * A CloudFront block arrives as an HTML page, and dumping that raw sends the
 * reader hunting a Twilio problem that does not exist — so name it.
 */
function describeFailure(status: number, body: string): string {
  if (body.trimStart().toLowerCase().startsWith("<!doctype html")) {
    return (
      `HTTP ${status} — blocked by CloudFront before reaching Twilio, not a Twilio error.\n` +
      `This is what a missing or rejected User-Agent looks like.`
    );
  }
  return `HTTP ${status}\n${body}`;
}

/** Twilio takes form-encoded bodies; array fields repeat the key. */
function encode(payload: Record<string, string | string[]>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
    else form.append(key, value);
  }
  return form;
}

/** What TOLLFREE_PHONE_NUMBER_SID is expected to resolve to, in E.164. */
const EXPECTED_NUMBER = "+18338536941";

/**
 * Confirm the SID really is the number we mean to register, before filing.
 *
 * The SID was read off a console URL. If it were wrong we would file a real
 * regulatory record against someone else's number and burn the submission —
 * a cheap GET is worth avoiding that.
 */
async function assertNumberMatches(): Promise<void> {
  const { sid } = credentials();
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${TOLLFREE_PHONE_NUMBER_SID}.json`,
    { headers: twilioHeaders() }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Could not look up ${TOLLFREE_PHONE_NUMBER_SID}. Nothing was filed.\n` +
        describeFailure(res.status, text)
    );
  }
  const number = (JSON.parse(text) as { phone_number?: string }).phone_number;
  if (number !== EXPECTED_NUMBER) {
    throw new Error(
      `SID ${TOLLFREE_PHONE_NUMBER_SID} is ${number}, not ${EXPECTED_NUMBER}. Nothing was filed.`
    );
  }
  console.log(`\n  Registering ${number} (${TOLLFREE_PHONE_NUMBER_SID}) — confirmed.`);
}

async function submit(): Promise<void> {
  await assertNumberMatches();

  const res = await fetch(API, {
    method: "POST",
    headers: twilioHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: encode(PAYLOAD),
  });

  const text = await res.text();
  if (!res.ok) {
    // Twilio's error body names the offending parameter — surface it whole,
    // because guessing which field a 400 refers to wastes a submission.
    console.error(`\nSubmission FAILED. Nothing was filed.\n`);
    console.error(describeFailure(res.status, text));
    process.exit(1);
  }

  const body = JSON.parse(text) as { sid?: string; status?: string; url?: string };
  console.log("\nSubmitted.\n");
  console.log(`  Verification SID : ${body.sid ?? "(none returned)"}`);
  console.log(`  Status           : ${body.status ?? "(none returned)"}`);
  console.log(`\nCheck progress with:  npx tsx scripts/tollfree-verify.ts --status ${body.sid ?? "<sid>"}`);
  console.log("The result also emails support@ambitt.agency.\n");
}

async function status(sid: string): Promise<void> {
  const res = await fetch(`${API}/${sid}`, { headers: twilioHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error(`\nLookup FAILED.\n${describeFailure(res.status, text)}\n`);
    process.exit(1);
  }
  const body = JSON.parse(text) as {
    status?: string;
    rejection_reason?: string;
    resource_links?: unknown;
  };
  console.log(`\n  Status           : ${body.status ?? "(unknown)"}`);
  if (body.rejection_reason) console.log(`  Rejection reason : ${body.rejection_reason}`);
  console.log();
}

function dryRun(): void {
  console.log("\nDRY RUN — nothing was sent to Twilio.\n");
  console.log(JSON.stringify(PAYLOAD, null, 2));
  console.log(`\n${Object.keys(PAYLOAD).length} fields. Then:\n`);
  console.log("  npx tsx scripts/tollfree-verify.ts --check    rehearse — reads the number back, files nothing");
  console.log("  npx tsx scripts/tollfree-verify.ts --submit   file it\n");
  console.log("Both ask for the auth token if it is not already in the environment.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const statusIndex = args.indexOf("--status");

  if (statusIndex !== -1) {
    const sid = args[statusIndex + 1];
    if (!sid) throw new Error("--status needs a verification SID, e.g. --status HHxxxxxxxx");
    await resolveCredentials();
    await status(sid);
    return;
  }

  // Credentials-only rehearsal. Filing is once-and-for-real, so there should be
  // a way to prove the credentials work that cannot accidentally file anything.
  if (args.includes("--check")) {
    await resolveCredentials();
    await assertNumberMatches();
    console.log("  Credentials work. Nothing was filed — add --submit to file.\n");
    return;
  }

  if (args.includes("--submit")) {
    await resolveCredentials();
    await submit();
    return;
  }

  // Dry run stays credential-free: reading the filing before sending it should
  // never require going and finding a secret.
  dryRun();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
