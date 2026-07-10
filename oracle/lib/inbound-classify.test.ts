// Run: node_modules/.bin/tsx oracle/lib/inbound-classify.test.ts
// Pure unit test for the machine-email guard — no server boot, no DB.
import { classifyAutomatedInbound } from "./inbound-classify.js";

interface Case {
  name: string;
  from: string;
  subject: string;
  headers?: unknown;
  wantAutomated: boolean;
  reasonIncludes?: string;
}

const cases: Case[] = [
  // --- Should DROP (automated) ---
  { name: "CoStar no-reply security alert", from: "CoStar <no-reply@costar.com>", subject: "Suspicious sign-in to your account", wantAutomated: true, reasonIncludes: "sender:no-reply" },
  { name: "security-noreply token anywhere", from: "security-noreply@costar.com", subject: "Verify your identity", wantAutomated: true, reasonIncludes: "sender:security-noreply" },
  { name: "notifications@ sender", from: "CoStar Notifications <notifications@costar.com>", subject: "Update on your account", wantAutomated: true, reasonIncludes: "sender:notifications" },
  { name: "mailer-daemon bounce", from: "Mail Delivery System <mailer-daemon@resend.dev>", subject: "Undeliverable: your message", wantAutomated: true },
  { name: "out-of-office subject from human addr", from: "Casey Litsey <litseyrealestate@gmail.com>", subject: "Automatic reply: Out of the office", wantAutomated: true, reasonIncludes: "subject:autoreply-or-bounce" },
  { name: "security subject from opaque sender", from: "account@somevendor.io", subject: "Suspicious activity detected on your account", wantAutomated: true, reasonIncludes: "security-notification" },
  { name: "Auto-Submitted header (array)", from: "Casey <litseyrealestate@gmail.com>", subject: "Re: your request", headers: [{ name: "Auto-Submitted", value: "auto-generated" }], wantAutomated: true, reasonIncludes: "auto-submitted" },
  { name: "Precedence: bulk (object)", from: "news@vendor.com", subject: "Weekly digest", headers: { Precedence: "bulk" }, wantAutomated: true, reasonIncludes: "precedence:bulk" },
  { name: "List-Id newsletter", from: "hello@substack.com", subject: "New post", headers: [{ name: "List-Id", value: "<abc.substack.com>" }], wantAutomated: true, reasonIncludes: "mailing-list" },
  { name: "null return-path (bounce)", from: "Casey <litseyrealestate@gmail.com>", subject: "hi", headers: { "Return-Path": "<>" }, wantAutomated: true, reasonIncludes: "null-return-path" },
  { name: "DSN multipart/report", from: "postmaster@gmail.com", subject: "Delivery Status Notification (Failure)", wantAutomated: true },

  // --- Should PASS (human, real task) ---
  { name: "normal human reply", from: "Casey Litsey <litseyrealestate@gmail.com>", subject: "Can you pull the downtown comps?", wantAutomated: false },
  { name: "operator email", from: "Kyle <kylekufuor@gmail.com>", subject: "status update please", wantAutomated: false },
  { name: "MFA code relay from human", from: "Casey <litseyrealestate@gmail.com>", subject: "Re: verification code", wantAutomated: false },
  { name: "false-positive guard: 'alerts' in subject", from: "sam@acme.com", subject: "quick question about the alerts page", wantAutomated: false },
  { name: "false-positive guard: name starts with 'ale'", from: "Alexandra <alexandra@acme.com>", subject: "following up", wantAutomated: false },
  { name: "false-positive guard: 'notify' partial localpart", from: "notifyteam-person@acme.com", subject: "hi", wantAutomated: false },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const emailData: Record<string, unknown> = c.headers !== undefined ? { headers: c.headers } : {};
  const v = classifyAutomatedInbound(c.from, c.subject, emailData);
  const okBool = v.automated === c.wantAutomated;
  const okReason = c.reasonIncludes ? v.reason.includes(c.reasonIncludes) : true;
  if (okBool && okReason) {
    pass++;
    // console.log(`  ok  ${c.name} -> ${v.automated} (${v.reason})`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}`);
    console.log(`        got automated=${v.automated} reason="${v.reason}"`);
    console.log(`        want automated=${c.wantAutomated}${c.reasonIncludes ? ` reason~="${c.reasonIncludes}"` : ""}`);
  }
}
console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
process.exitCode = fail ? 1 : 0;
