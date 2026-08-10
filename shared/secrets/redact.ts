/* ---------------------------------------------------------------------------
   Strip secrets out of text a model wrote about its own failure.

   This exists because of a real leak. On 2026-07-10 the browser agent failed a
   CoStar sign-in and explained itself: "the automation entered the correct
   username (…) and password (…), and reached the two-factor screen." That
   sentence was stored verbatim in `Credential.lastUseError`, so a client's
   password sat readable in the database — in the same row whose encrypted
   column was doing its job perfectly. The vault was never the weak point; the
   apology was.

   The lesson generalises past this one column: any free-text field a model can
   write into is a place a secret can land, because the model is narrating what
   it did and what it did was type a password. Encrypting at rest does nothing
   about that. So redaction belongs at the write, not at each call site.

   Two passes, because they fail differently:

   1. KNOWN VALUES — the actual stored secrets for that client and tool. Exact,
      and immune to phrasing: it catches "the password Hunter2 was rejected"
      just as well as "password: Hunter2". Useless for a secret we don't hold.
   2. LABELLED SHAPES — "password: x", "code 331713", "api key = …". Catches
      one-time codes and anything typed into a tool we have no record of.
      Necessarily fuzzy, so it is the second net, not the first.

   What survives matters as much as what goes. The error is read by a human
   deciding whether a login is broken, so the sentence keeps its shape and only
   the secret becomes ▪▪▪. "Password ▪▪▪ was rejected" is still a diagnosis.
   --------------------------------------------------------------------------- */

export const MASK = "▪▪▪";

/**
 * Values short enough to appear in ordinary prose by accident. Masking every
 * occurrence of a 3-character secret would shred the sentence and tell the
 * reader nothing, so we skip them — a secret that short is not the risk here.
 */
const MIN_MASKABLE = 4;

/** Regex-escape a stored value before searching for it in free text. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Labelled secrets: a keyword, an optional separator, then the value. The value
 * may be wrapped in quotes or parens, which is exactly how a model writes it
 * when narrating ("password (Hunter2)").
 *
 * The keyword itself is kept — "password ▪▪▪ was rejected" tells you which
 * field failed, and dropping the label would leave an error nobody can act on.
 */
const LABELLED = new RegExp(
  String.raw`\b(password|passwd|pwd|passcode|pass phrase|passphrase|secret|api[ _-]?key|access[ _-]?token|bearer|token|credential)\b` +
    String.raw`(\s*(?:is|was|of|=|:)?\s*)` +
    String.raw`([("'\[]?)([^\s"')\],;]{3,})([)"'\]]?)`,
  "gi",
);

/**
 * One-time codes. Lower risk than a password — they expire — but there is no
 * reason to keep one, and the July error stored a live 2FA code alongside the
 * password that made it usable.
 */
const OTP = new RegExp(
  String.raw`\b((?:verification|security|one[- ]time|login|auth(?:entication)?|2fa|mfa)\s+code)\b` +
    String.raw`(\s*(?:is|was|=|:)?\s*)([("'\[]?)(\d{4,10})([)"'\]]?)`,
  "gi",
);

/**
 * Words that follow "password" in a sentence about a password rather than a
 * password itself. Without this, "password was rejected" becomes "password ▪▪▪"
 * and the reader loses the only fact in the message.
 */
const NOT_A_SECRET = new Set([
  "was", "is", "were", "the", "a", "an", "and", "or", "but", "not", "no",
  "rejected", "accepted", "incorrect", "correct", "wrong", "invalid", "valid",
  "expired", "failed", "failure", "error", "prompt", "field", "screen", "page",
  "entered", "typed", "submitted", "required", "missing", "empty", "blank",
  "manager", "reset", "change", "changed", "for", "from", "with", "into",
  "twice", "again", "successfully", "unsuccessfully", "provided",
]);

/**
 * Remove secrets from free text before it is stored.
 *
 * @param text        the message as written, usually by a model
 * @param knownValues stored secret values for the relevant client/tool
 */
export function redactSecrets(text: string | null | undefined, knownValues: string[] = []): string {
  if (!text) return "";
  let out = text;

  // Pass 1 — exact known values. Longest first, so a password that contains a
  // username as a substring does not leave the tail of it exposed.
  const values = [...new Set(knownValues.filter((v) => typeof v === "string" && v.length >= MIN_MASKABLE))]
    .sort((a, b) => b.length - a.length);
  for (const v of values) {
    out = out.replace(new RegExp(escapeRe(v), "gi"), MASK);
  }

  // Pass 2 — labelled shapes, for secrets we do not hold.
  out = out.replace(LABELLED, (whole, label, sep, open, value, close) => {
    if (value === MASK) return whole;
    if (NOT_A_SECRET.has(String(value).toLowerCase())) return whole;
    return `${label}${sep}${open}${MASK}${close}`;
  });

  out = out.replace(OTP, (_whole, label, sep, open, _digits, close) => `${label}${sep}${open}${MASK}${close}`);

  return out;
}

/**
 * True if the text still looks like it carries a secret. Used by the test that
 * guards this file, and safe to assert on before a write in future call sites.
 */
export function looksLikeItHasASecret(text: string, knownValues: string[] = []): boolean {
  if (knownValues.some((v) => v.length >= MIN_MASKABLE && text.toLowerCase().includes(v.toLowerCase()))) {
    return true;
  }
  for (const re of [LABELLED, OTP]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const value = m[4];
      if (value && value !== MASK && !NOT_A_SECRET.has(value.toLowerCase())) return true;
    }
  }
  return false;
}
