// Run: node_modules/.bin/tsx src/lib/safe-next.test.ts
// Pure unit test for the post-sign-in redirect target. No DOM, no network.
//
// Worth pinning down in both directions. Too permissive is an open redirect —
// a link that carries a client from our real login page to a convincing copy.
// Too aggressive silently mangles real paths, which is exactly what the first
// draft of this did.
import { safeNext, DEFAULT_NEXT } from "./safe-next.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: string, expected: string): void {
  if (actual === expected) passed++;
  else failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

// --- Real destinations must survive EXACTLY ---------------------------------
// The tools invite is the reason this exists, and its path contains a hyphen.
check("agent tools path", safeNext("/agents/cmp123/tools"), "/agents/cmp123/tools");
check("hyphenated path is not mangled", safeNext("/agent-tools"), "/agent-tools");
check("hyphens anywhere survive", safeNext("/a-b/c-d/e-f"), "/a-b/c-d/e-f");
check("query string survives", safeNext("/agent/tools?a=cmp123"), "/agent/tools?a=cmp123");
check("root", safeNext("/"), "/");

// --- Open-redirect attempts -------------------------------------------------
check("absolute url", safeNext("https://evil.com"), DEFAULT_NEXT);
check("protocol-relative", safeNext("//evil.com"), DEFAULT_NEXT);
check("backslash variant", safeNext("/\\evil.com"), DEFAULT_NEXT);
check("double backslash", safeNext("/\\\\evil.com"), DEFAULT_NEXT);
check("leading space then protocol-relative", safeNext("  //evil.com"), DEFAULT_NEXT);
check("newline hiding a protocol-relative", safeNext("/\n/evil.com"), DEFAULT_NEXT);
check("tab hiding a protocol-relative", safeNext("\t//evil.com"), DEFAULT_NEXT);
check("not a path at all", safeNext("evil.com"), DEFAULT_NEXT);
check("javascript scheme", safeNext("javascript:alert(1)"), DEFAULT_NEXT);

// --- Loops ------------------------------------------------------------------
check("login itself", safeNext("/login"), DEFAULT_NEXT);
check("login subpath", safeNext("/login/new-password"), DEFAULT_NEXT);
check("login with query", safeNext("/login?next=/x"), DEFAULT_NEXT);

// --- Absent ------------------------------------------------------------------
check("null", safeNext(null), DEFAULT_NEXT);
check("undefined", safeNext(undefined), DEFAULT_NEXT);
check("empty", safeNext(""), DEFAULT_NEXT);
check("whitespace only", safeNext("   "), DEFAULT_NEXT);

console.log(`\nsafe-next: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
