// Run: node_modules/.bin/tsx shared/platform-tools/operator-send.test.ts
//
// send_email_for_operator lets Atlas email anyone the operator names. The engine
// exposes every built-in tool to every agent, so the ONLY thing standing between
// a prompt-injected client email and "email arbitrary people" is the sender
// check in this tool. These assertions pin it, plus the two other properties
// the design depends on: replies route to the operator, and the email always
// says the recipient would get their own agent.
//
// No network: the send path is never reached on a refusal, and render is pure.
import { extractAddress, isOperator, renderOperatorEmail, sendEmailForOperator } from "./operator-send";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const OP = "kyle@example.com";

async function main() {
  // --- address parsing ---
  check("bare address parses", extractAddress("kyle@example.com") === "kyle@example.com");
  check("display-name form parses", extractAddress("Kyle Kufuor <Kyle@Example.com>") === "kyle@example.com");
  check("garbage is rejected", extractAddress("not an email") === null);
  check("undefined is rejected", extractAddress(undefined) === null);

  // --- the lock ---
  process.env.OPERATOR_EMAIL = OP;
  check("operator is recognised", isOperator(OP));
  check("operator is recognised in display-name form", isOperator(`Kyle <${OP.toUpperCase()}>`));
  check("a client is not the operator", !isOperator("client@business.com"));
  check("a lookalike is not the operator", !isOperator("kyle@example.com.evil.net"));
  check("an empty sender is not the operator", !isOperator(undefined));

  delete process.env.OPERATOR_EMAIL;
  check("with OPERATOR_EMAIL unset, nobody is the operator (fails closed)", !isOperator(OP));
  process.env.OPERATOR_EMAIL = OP;

  const base = {
    toName: "Dale Whitlock",
    toEmail: "dale@whitlockroofing.com",
    subject: "What an agent could do for Whitlock Roofing",
    body: "First paragraph.\n\nSecond paragraph.",
    callerAgentId: "atlas",
    callerAgentName: "Atlas",
  };

  // A refusal must return before any send is attempted. If the lock failed, this
  // would reach sendEmail and throw on the missing Resend client instead.
  const refusedClient = await sendEmailForOperator({ ...base, senderEmail: "client@business.com" });
  check("a client-started run is refused", refusedClient.status === "refused");
  check("the refusal says nothing was sent", /nothing was sent/i.test(refusedClient.message));

  const refusedNone = await sendEmailForOperator({ ...base, senderEmail: undefined });
  check("a run with no sender is refused", refusedNone.status === "refused");

  // --- input validation (operator run, so these reach validation, not the lock) ---
  const badTo = await sendEmailForOperator({ ...base, senderEmail: OP, toEmail: "nope" });
  check("an invalid recipient is an error", badTo.status === "error");
  const noSubject = await sendEmailForOperator({ ...base, senderEmail: OP, subject: "  " });
  check("an empty subject is an error", noSubject.status === "error");
  const noBody = await sendEmailForOperator({ ...base, senderEmail: OP, body: "" });
  check("an empty body is an error", noBody.status === "error");
  const huge = await sendEmailForOperator({ ...base, senderEmail: OP, body: "x".repeat(4_001) });
  check("an oversized body is an error", huge.status === "error");

  // --- the rendered email ---
  const html = renderOperatorEmail({ firstName: "Dale", body: base.body, portalBase: "https://portal.test" });
  check("greets by first name", html.includes("Hi Dale,"));
  check("renders each paragraph", html.includes("First paragraph.") && html.includes("Second paragraph."));
  check("says the recipient would get their own agent", /get their own agent/i.test(html));
  check("says replies go to the team", /replies to this email go to our team/i.test(html));
  check("has no onboarding call to action", !/onboard/i.test(html));
  check("signs as Atlas", html.includes("Atlas<br />"));

  const hostile = renderOperatorEmail({ firstName: "<b>x</b>", body: "<script>alert(1)</script>", portalBase: "https://p" });
  check("escapes HTML in the name", !hostile.includes("<b>x</b>"));
  check("escapes HTML in the body", !hostile.includes("<script>"));

  console.log(`${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

main();
