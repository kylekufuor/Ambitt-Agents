// Subject lines for the two approval emails an agent fires from inside a run:
// request_approval (action-required) and request_tool_connection (permission).
//
// WHY THIS EXISTS: both subjects used to be agent-constant — "{agent} — Action
// Required" / "{agent} — Permission Request". The outbound seatbelt keys its
// repetition check on the SUBJECT, so a constant subject made every approval
// ask look like the same email: three DIFFERENT asks to the same client inside
// 30 minutes tripped repetition and system-paused a perfectly healthy agent.
// Supervised mode is our default, so several distinct asks in one session is
// correct behaviour, not a runaway.
//
// The fix is to put the actual ask in the subject. Distinct asks now produce
// distinct subjects (no false trip); the same ask sent over and over still
// produces the same subject and still trips (real loops still caught).
//
// Copy rules (client-facing): plain English, first person, no jargon, no
// "Action Required" shouting. The client should know what they're being asked
// from the inbox list without opening anything:
//
//   Arthur — approve: send the outreach list to 12 owners
//   Arthur — access needed: HubSpot
//
// Pure string functions — no DB, no env, no I/O.

// Inbox clients truncate around 60-70 characters on mobile, and the agent name
// plus label already eats ~20. Keep the ask itself short enough that the
// distinguishing part survives, long enough that two different asks don't
// collapse into the same string (which would resurrect the false trip).
const MAX_DETAIL = 60;

// First-person lead-ins the model habitually opens a summary with ("I'd like to
// send these 3 follow-up emails..." — see the request_approval tool schema).
// They carry no information and push the distinguishing detail out of the
// visible part of the subject, so we drop them and keep the verb.
const LEAD_IN =
  /^(?:please\s+)?(?:(?:i\s*(?:'|’)?d\s+like\s+to)|(?:i\s+would\s+like\s+to)|(?:i\s+want\s+to)|(?:i\s*(?:'|’)?m\s+going\s+to)|(?:i\s+am\s+going\s+to)|(?:i\s+plan\s+to)|(?:i\s+need\s+to)|(?:i\s+intend\s+to)|(?:can\s+you\s+approve)|(?:could\s+you\s+approve)|(?:approval\s+(?:needed|required))|(?:review\s+and\s+approve)|(?:sign\s+off\s+on)|(?:approve))\b[:,]?\s+/i;

/**
 * Trim a string to `max` characters on a word boundary, appending a single-char
 * ellipsis when anything was cut. Never returns a bare dangling separator.
 */
export function clipDetail(text: string, max: number = MAX_DETAIL): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only break on a space if it leaves a meaningful amount of text; otherwise
  // (one very long token) hard-cut.
  const head = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s.,;:—–-]+$/, "")}…`;
}

/**
 * Turn an agent-written summary into the short "what am I being asked" fragment
 * that goes after the label: first sentence, no lead-in, no trailing period,
 * clipped.
 */
export function askDetail(text: string | undefined | null, max: number = MAX_DETAIL): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  // First sentence only — the rest is detail for the email body, not the subject.
  const firstSentence = flat.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? flat;
  const stripped = firstSentence.replace(LEAD_IN, "").trim();
  const core = (stripped || firstSentence).replace(/[\s.]+$/, "").trim();
  return clipDetail(core, max);
}

/**
 * Subject for the action-required (request_approval) email.
 * Falls back to the first plan step when the summary is empty, then to a plain
 * ask — a constant subject only ever appears when the agent gave us nothing to
 * describe the ask with.
 */
export function actionRequiredSubject(
  agentName: string,
  summary?: string | null,
  firstStep?: string | null,
): string {
  const detail = askDetail(summary) || askDetail(firstStep);
  return detail ? `${agentName} — approve: ${detail}` : `${agentName} — can you approve this?`;
}

/**
 * Subject for the permission (request_tool_connection) email. The app being
 * requested IS the distinguishing detail, so it leads; the summary is only a
 * fallback for callers that pass no permission rows.
 */
export function permissionSubject(
  agentName: string,
  appNames: Array<string | null | undefined>,
  summary?: string | null,
): string {
  const apps = appNames.map((a) => (a ?? "").trim()).filter((a) => a.length > 0);
  // The summary fallback opens with "I need access to your X account to ..."
  // (see request-tool-connection.ts), which the label already says. Stripped
  // here rather than in askDetail: "I need access to" is real information in an
  // approval ask, it's only redundant under the "access needed" label.
  const fromSummary = askDetail((summary ?? "").replace(/^\s*(?:please\s+)?i\s+need\s+access\s+to\s+/i, ""));
  const detail = apps.length > 0 ? clipDetail(apps.join(" + ")) : fromSummary;
  return detail ? `${agentName} — access needed: ${detail}` : `${agentName} — I need access to one of your tools`;
}
