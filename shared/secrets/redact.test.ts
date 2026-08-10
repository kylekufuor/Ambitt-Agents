// Run: node_modules/.bin/tsx shared/secrets/redact.test.ts
// Pure unit test for the credential redactor — no DB, no decryption, no
// network. The first block is the actual 2026-07-10 leak with the values
// swapped for fakes; if this file is ever loosened, that is the case that has
// to keep passing, because it is a sentence a model really wrote about a real
// client that really got stored.
import { redactSecrets, looksLikeItHasASecret, MASK } from "./redact.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`        got  ${g}`);
    console.log(`        want ${w}`);
  }
}

const REAL_LEAK =
  "The task could not be completed. The automation successfully navigated to " +
  "costar.com, entered the correct username (broker@example.com) and password " +
  "(Hunter2Example!), and reached the two-factor authentication verification " +
  "screen. However, the provided verification code 331713 was repeatedly rejected.";
const STORED = ["broker@example.com", "Hunter2Example!"];
const CLEANED = redactSecrets(REAL_LEAK, STORED);

// --- the July 2026 leak -----------------------------------------------------
check("leak: password gone", CLEANED.includes("Hunter2Example!"), false);
check("leak: username gone", CLEANED.includes("broker@example.com"), false);
check("leak: one-time code gone", CLEANED.includes("331713"), false);
check("leak: still names the site", CLEANED.includes("costar.com"), true);
check("leak: still names the step", CLEANED.includes("two-factor"), true);
check("leak: still gives the outcome", CLEANED.includes("repeatedly rejected"), true);
check("leak: something was masked", CLEANED.includes(MASK), true);
check("leak: detector saw it before", looksLikeItHasASecret(REAL_LEAK, STORED), true);
check("leak: detector clears it after", looksLikeItHasASecret(CLEANED, STORED), false);

// --- known values, whatever the phrasing ------------------------------------
// The point of pass 1: the model does not have to say the word "password".
check(
  "known: unlabelled secret still caught",
  redactSecrets("I typed Hunter2Example! and it bounced.", ["Hunter2Example!"]),
  `I typed ${MASK} and it bounced.`
);
check(
  "known: case-insensitive",
  /hunter/i.test(redactSecrets("tried HUNTER2EXAMPLE! twice", ["Hunter2Example!"])),
  false
);
check(
  "known: every occurrence, not just the first",
  redactSecrets("used s3cr3tpw, then s3cr3tpw again", ["s3cr3tpw"]),
  `used ${MASK}, then ${MASK} again`
);
// "pw12" is not a substring here, but a shorter value matching first is how a
// longer secret gets chopped into a still-readable tail. Longest-first stops it.
check(
  "known: longest value masked first, no tail survives",
  redactSecrets("password (pw-and-more)", ["pw12", "pw-and-more"]).includes("and-more"),
  false
);
// Masking "no" would shred the sentence and protect nothing.
check(
  "known: values too short to mask are skipped",
  redactSecrets("the login did not complete", ["no"]),
  "the login did not complete"
);

// --- labelled shapes, for secrets we do not hold -----------------------------
check("labelled: colon form", redactSecrets("password: sup3rsecret"), `password: ${MASK}`);
check("labelled: equals form", redactSecrets("api_key=abc123xyz").includes("abc123xyz"), false);
check(
  "labelled: the parenthesised form a model writes",
  redactSecrets("the password (letmein99) failed"),
  `the password (${MASK}) failed`
);
check(
  "labelled: bearer token",
  redactSecrets("sent bearer eyJhbGciOiJIUzI1NiJ9").includes("eyJhbGciOiJIUzI1NiJ9"),
  false
);
check("labelled: keeps the label so the error is actionable", redactSecrets("password: sup3rsecret").includes("password"), true);

// --- what must NOT be mangled ----------------------------------------------
// Twelve cases exist here on purpose: a redactor that eats the sentence is a
// redactor that gets switched off.
check(
  "safe: a sentence about a password",
  redactSecrets("The password was rejected and the account is now locked."),
  "The password was rejected and the account is now locked."
);
check(
  "safe: ordinary failure prose",
  redactSecrets("Sign-in did not complete. The page timed out after 30 seconds."),
  "Sign-in did not complete. The page timed out after 30 seconds."
);
for (const s of [
  "password is incorrect",
  "password was expired",
  "password field was empty",
  "password entered successfully",
]) {
  check(`safe: grammar after the label — "${s}"`, redactSecrets(s), s);
}
check("safe: idempotent", redactSecrets(CLEANED, STORED), CLEANED);
check("safe: empty string", redactSecrets(""), "");
check("safe: null", redactSecrets(null), "");
check("safe: undefined", redactSecrets(undefined), "");

// --- one-time codes ---------------------------------------------------------
check(
  "otp: verification code",
  redactSecrets("verification code 331713 was rejected").includes("331713"),
  false
);
check("otp: 2fa phrasing", redactSecrets("the 2fa code is 884412").includes("884412"), false);
check(
  "otp: unrelated numbers left alone",
  redactSecrets("The page timed out after 30 seconds and returned 403."),
  "The page timed out after 30 seconds and returned 403."
);

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
