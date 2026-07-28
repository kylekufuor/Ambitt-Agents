// Run: node_modules/.bin/tsx oracle/lib/email-subject.test.ts
// Pure unit test for the approval-email subject lines — no server, no DB.
//
// The property that matters for safety: DIFFERENT asks must produce DIFFERENT
// subjects (the outbound seatbelt keys repetition on the subject, so identical
// subjects for distinct asks system-pause a healthy agent), while the SAME ask
// must produce a byte-identical subject so a real loop still trips.
import { actionRequiredSubject, permissionSubject, askDetail, clipDetail } from "./email-subject.js";

const NAME = "Arthur";

let pass = 0;
let fail = 0;
const eq = (name: string, got: string, want: string) => {
  if (got === want) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`        got  "${got}"`);
    console.log(`        want "${want}"`);
  }
};
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

// --- action-required: the ask lands in the subject -------------------------
eq(
  "action-required carries the ask",
  actionRequiredSubject(NAME, "I'd like to send the outreach list to 12 owners."),
  `${NAME} needs your approval: send the outreach list to 12 owners`,
);
eq(
  "curly apostrophe lead-in stripped",
  actionRequiredSubject(NAME, "I’d like to book a tour of 400 Main St for Thursday."),
  `${NAME} needs your approval: book a tour of 400 Main St for Thursday`,
);
eq(
  "redundant leading 'Approve' dropped (no 'approve: approve')",
  actionRequiredSubject(NAME, "Approve the outreach list before I send it."),
  `${NAME} needs your approval: the outreach list before I send it`,
);
eq(
  "only the first sentence is used",
  actionRequiredSubject(NAME, "I want to archive 6 listings. They all went under contract last week."),
  `${NAME} needs your approval: archive 6 listings`,
);
eq(
  "newlines collapse to single spaces",
  actionRequiredSubject(NAME, "I plan to\n  email\tBob\n\nand Alice"),
  `${NAME} needs your approval: email Bob and Alice`,
);
eq(
  "no lead-in to strip -> summary used as-is",
  actionRequiredSubject(NAME, "The Q3 report is drafted and ready to go out."),
  `${NAME} needs your approval: The Q3 report is drafted and ready to go out`,
);
eq(
  "long summary truncates on a word boundary with an ellipsis",
  actionRequiredSubject(
    NAME,
    "I'd like to email every owner in the downtown submarket about the new vacancy report we published",
  ),
  `${NAME} needs your approval: email every owner in the downtown submarket about…`,
);
eq(
  "empty summary falls back to the first plan step",
  actionRequiredSubject(NAME, "   ", "Send the contract to Casey"),
  `${NAME} needs your approval: Send the contract to Casey`,
);
eq(
  "nothing to describe the ask -> plain human fallback",
  actionRequiredSubject(NAME, undefined, undefined),
  `${NAME} needs your approval`,
);

// --- permission: the app IS the distinguishing detail ----------------------
eq("permission names the app", permissionSubject(NAME, ["HubSpot"]), `${NAME} needs access to HubSpot`);
eq("permission with two apps", permissionSubject(NAME, ["Gmail", "Google Calendar"]), `${NAME} needs access to Gmail + Google Calendar`);
eq(
  "permission with no app row falls back to the summary",
  permissionSubject(NAME, [], "I need access to your CRM to log the calls."),
  `${NAME} needs access to your CRM to log the calls`,
);
eq("permission with nothing at all", permissionSubject(NAME, [null, "  "]), `${NAME} needs access to one of your tools`);

// --- the seatbelt property -------------------------------------------------
{
  const asks = [
    "I'd like to send the outreach list to 12 owners.",
    "I'd like to book a tour of 400 Main St for Thursday.",
    "I'd like to archive the 6 listings that went under contract.",
  ];
  const subjects = asks.map((a) => actionRequiredSubject(NAME, a));
  ok(
    "3 different approval asks -> 3 different subjects",
    new Set(subjects).size === 3,
    `got ${JSON.stringify(subjects)}`,
  );
  ok(
    "the same ask twice -> byte-identical subject (real loops still trip)",
    actionRequiredSubject(NAME, asks[0]) === actionRequiredSubject(NAME, asks[0]),
  );
  ok(
    "3 different apps -> 3 different subjects",
    new Set(["HubSpot", "Gmail", "Slack"].map((a) => permissionSubject(NAME, [a]))).size === 3,
  );
  ok(
    "every generated subject stays inbox-sized (<= 90 chars)",
    subjects.every((s) => s.length <= 90),
    `got ${JSON.stringify(subjects.map((s) => s.length))}`,
  );
  // The label ("{name} needs your approval: ") is longer than the old
  // "{name} — Action Required" banner it replaced, so MAX_DETAIL has to give
  // that back or a long agent name plus a maxed-out ask blows the budget.
  // Worst case: the longest realistic name against an ask that clips.
  const LONG_NAME = "Alexandria"; // 10 chars; the cap holds to 15
  const maxed = [
    actionRequiredSubject(
      LONG_NAME,
      "I'd like to email every single owner in the downtown submarket about the new vacancy report we just published",
    ),
    permissionSubject(LONG_NAME, ["Google Calendar", "Google Sheets", "Google Drive", "HubSpot"]),
  ];
  ok(
    "a long agent name with a maxed-out ask still fits the inbox budget",
    maxed.every((s) => s.length <= 90),
    `got ${JSON.stringify(maxed.map((s) => [s.length, s]))}`,
  );
}

// --- the em-dash ban -------------------------------------------------------
// Our own subjects must never contain U+2014. The send-time scrub in
// shared/email.ts would rewrite one ("Arthur — approve:" → "Arthur, approve:"),
// which reads worse than purpose-written copy AND fires the scrub's warn log on
// every email, destroying its value as the signal that a MODEL has drifted off
// the rule. An em dash arriving in the summary (agent-written) is scrubbed on
// the way out; one WE compose is a bug.
{
  const composed = [
    actionRequiredSubject(NAME, "I'd like to send the outreach list to 12 owners."),
    actionRequiredSubject(NAME, "   ", "Send the contract to Casey"),
    actionRequiredSubject(NAME, undefined, undefined),
    actionRequiredSubject(
      NAME,
      "I'd like to email every owner in the downtown submarket about the new vacancy report we published",
    ),
    permissionSubject(NAME, ["HubSpot"]),
    permissionSubject(NAME, ["Gmail", "Google Calendar"]),
    permissionSubject(NAME, [], "I need access to your CRM to log the calls."),
    permissionSubject(NAME, [null, "  "]),
  ];
  ok(
    "no composed subject contains an em dash (U+2014)",
    composed.every((s) => !s.includes("—")),
    `got ${JSON.stringify(composed.filter((s) => s.includes("—")))}`,
  );
  ok(
    "every composed subject stays inbox-sized (<= 90 chars)",
    composed.every((s) => s.length <= 90),
    `got ${JSON.stringify(composed.map((s) => s.length))}`,
  );
}

// --- clipDetail edges ------------------------------------------------------
eq("clip leaves short text alone", clipDetail("send 12 emails", 60), "send 12 emails");
eq("clip at exactly the limit is untouched", clipDetail("a".repeat(60), 60), "a".repeat(60));
eq("clip hard-cuts one very long token", clipDetail("a".repeat(80), 20), `${"a".repeat(20)}…`);
eq("clip drops a dangling separator before the ellipsis", clipDetail("send the report to, everyone in the list", 20), "send the report to…");
eq("askDetail on empty input is empty", askDetail("   \n  "), "");

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
