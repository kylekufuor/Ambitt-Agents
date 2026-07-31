/**
 * Phone normalisation for the verification-code relay.
 *
 * Lives in lib rather than inside the route handler so it can be unit tested
 * without booting Next: the route imports "@/lib/..." aliases that only
 * resolve inside the framework, which made the parsing — the part most likely
 * to be wrong — the part hardest to check.
 */

/**
 * To E.164, or null.
 *
 * Bare 10 digits are assumed US/CA. That is a real assumption, not a fallback:
 * it is the only market we operate in today, and when that changes this should
 * ask for a country rather than keep guessing.
 */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^\d+]/g, "");
  let out: string;
  if (cleaned.startsWith("+")) out = "+" + cleaned.slice(1).replace(/\D/g, "");
  else if (cleaned.length === 10) out = "+1" + cleaned;
  else if (cleaned.length === 11 && cleaned.startsWith("1")) out = "+" + cleaned;
  else return null;

  // E.164: leading country digit 1-9, then 7 to 14 more.
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}

/** "+19185550142" -> "(918) 555 0142". Anything else is returned as-is. */
export function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]} ${m[3]}` : e164;
}
