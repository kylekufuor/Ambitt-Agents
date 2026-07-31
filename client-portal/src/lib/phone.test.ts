// Run: node_modules/.bin/tsx client-portal/src/lib/phone.test.ts
//
// The number a login code gets texted to. Getting this wrong sends a client's
// one-time code to a number that is not theirs, so the rejections matter more
// than the accepts.
import { toE164, prettyPhone } from "./phone";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error(`FAIL  ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}

// --- the shapes a human actually types --------------------------------------
for (const raw of ["9185550142", "(918) 555-0142", "918-555-0142", "918.555.0142",
                   " 918 555 0142 ", "+1 918 555 0142", "19185550142", "+19185550142"]) {
  check(`accepts ${JSON.stringify(raw)}`, toE164(raw), "+19185550142");
}
check("keeps a non-US number as given", toE164("+44 7700 900123"), "+447700900123");

// --- refusals ---------------------------------------------------------------
// Each of these would otherwise become a plausible-looking wrong number.
for (const raw of ["555", "91855501", "abc", "", "   ", "+", "+0123456789",
                   "0000", "91855501423456789012"]) {
  check(`rejects ${JSON.stringify(raw)}`, toE164(raw), null);
}
check("rejects a non-string", toE164(9185550142 as unknown), null);
check("rejects null", toE164(null), null);
check("rejects an object", toE164({ phone: "9185550142" } as unknown), null);

// A 9-digit string must never be silently padded into a real number.
check("REGRESSION: 9 digits is not padded into a US number", toE164("918555014"), null);

// --- display ----------------------------------------------------------------
check("formats US for reading back", prettyPhone("+19185550142"), "(918) 555 0142");
check("leaves international alone", prettyPhone("+447700900123"), "+447700900123");

console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
