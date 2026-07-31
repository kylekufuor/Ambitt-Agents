// Run: node_modules/.bin/tsx oracle/lib/forwardUnrouted.test.ts
// Pure unit test for the unrouted-inbound forward rules — no DB, no mail provider.
//
// These rules decide whether real mail reaches a human. Getting them wrong in
// one direction loses correspondence sent to a published address; in the other
// it builds a mail loop. Both are worth pinning down.
import { decideForward, type ForwardDecisionInput } from "./forwardUnrouted.js";

// --- Tiny assertion harness ------------------------------------------------
let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

const base: ForwardDecisionInput = {
  toAddresses: ["support@ambitt.agency"],
  from: "noreply@twilio.com",
  domain: "ambitt.agency",
  operator: "kyle@example.com",
  forwardsThisHour: 0,
  cap: 20,
};

const decide = (over: Partial<ForwardDecisionInput> = {}) => decideForward({ ...base, ...over });

// --- The address that started this -----------------------------------------
check("support@ is forwarded", decide(), { forward: true, recipients: ["support@ambitt.agency"] });

check("hello@ is forwarded", decide({ toAddresses: ["hello@ambitt.agency"] }), {
  forward: true,
  recipients: ["hello@ambitt.agency"],
});

// Mixed recipients: keep ours, drop the rest, still forward.
check(
  "mixed recipients forward only our own addresses",
  decide({ toAddresses: ["support@ambitt.agency", "someone@elsewhere.com"] }),
  { forward: true, recipients: ["support@ambitt.agency"] }
);

check(
  "recipient casing and whitespace do not defeat the match",
  decide({ toAddresses: ["  Support@Ambitt.Agency "] }),
  { forward: true, recipients: ["  Support@Ambitt.Agency "] }
);

// --- Other products on the same Resend account ------------------------------
check(
  "a foreign domain is not forwarded",
  decide({ toAddresses: ["qa-agent-free-1@mcquizzy.ai"] }),
  { forward: false, outcome: "unrouted_foreign_domain" }
);

// A lookalike domain must not be treated as ours: endsWith without the @ would
// match "notambitt.agency", which is somebody else entirely.
check(
  "a domain merely ending in ours is not ours",
  decide({ toAddresses: ["support@notambitt.agency"] }),
  { forward: false, outcome: "unrouted_foreign_domain" }
);

// --- Loop safety ------------------------------------------------------------
check(
  "an operator on our own domain is refused, not looped",
  decide({ operator: "ops@ambitt.agency" }),
  { forward: false, outcome: "unrouted_loop_risk" }
);

check(
  "our own forwarder coming back round is refused",
  decide({ from: "Ambitt Agents <forward@ambitt.agency>" }),
  { forward: false, outcome: "unrouted_loop_risk" }
);

// --- Configuration ----------------------------------------------------------
check("no operator configured means no forward", decide({ operator: "" }), {
  forward: false,
  outcome: "unrouted_no_operator",
});

check("a whitespace-only operator counts as unset", decide({ operator: "   " }), {
  forward: false,
  outcome: "unrouted_no_operator",
});

// --- The cap ----------------------------------------------------------------
check("under the cap still forwards", decide({ forwardsThisHour: 19, cap: 20 }), {
  forward: true,
  recipients: ["support@ambitt.agency"],
});

check("at the cap stops forwarding", decide({ forwardsThisHour: 20, cap: 20 }), {
  forward: false,
  outcome: "unrouted_capped",
});

check("over the cap stops forwarding", decide({ forwardsThisHour: 999, cap: 20 }), {
  forward: false,
  outcome: "unrouted_capped",
});

// Order matters: a loop is unsafe, a cap is merely noisy. If both apply, the
// unsafe one must win — otherwise raising the cap would quietly enable a loop.
check(
  "loop risk outranks the cap",
  decide({ operator: "ops@ambitt.agency", forwardsThisHour: 999 }),
  { forward: false, outcome: "unrouted_loop_risk" }
);

// --- Report -----------------------------------------------------------------
console.log(`\nforwardUnrouted: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
