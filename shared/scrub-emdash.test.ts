// Run: node_modules/.bin/tsx shared/scrub-emdash.test.ts
// Pure unit test for the send-time em-dash scrub, plus wiring tests that drive
// the real sendSms() and sendEmail() paths. No network, no DB, no Twilio or
// Resend credentials.
//
// NOTE: ./email.js must NOT be imported statically here. The email wiring test
// installs a fake Prisma on globalThis, and shared/db.ts latches whatever is
// there the first time it loads — so the import has to happen after the fake
// is in place, i.e. dynamically, inside emailWiringTests().
import { stripEmDashes, stripEmDashesHtml } from "./scrub-emdash.js";
import { sendSms, type SmsSender } from "./sms.js";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.log(`FAIL  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

function eq(name: string, got: string, want: string): void {
  check(name, got === want, `got  "${got}"\n        want "${want}"`);
}

function count(name: string, got: number, want: number): void {
  check(name, got === want, `got replaced=${got} want replaced=${want}`);
}

// --- Plain text: the substitution rules ------------------------------------

const spaced = stripEmDashes("We shipped it — the client signed off.");
eq("spaced em dash → comma", spaced.text, "We shipped it, the client signed off.");
count("spaced em dash counts once", spaced.replaced, 1);

const capital = stripEmDashes("I finished the audit — Casey has the file now.");
eq("clause-ending dash before capital → period", capital.text, "I finished the audit. Casey has the file now.");

const unspaced = stripEmDashes("the report—finally—arrived");
eq("unspaced dash → comma", unspaced.text, "the report, finally, arrived");
count("unspaced pair counts twice", unspaced.replaced, 2);

eq(
  "unspaced dash before capital → period",
  stripEmDashes("I sent it—Casey confirmed.").text,
  "I sent it. Casey confirmed."
);

const many = stripEmDashes("One — two — three—four");
eq("multiple in one string", many.text, "One, two, three, four");
count("multiple counted individually", many.replaced, 3);

const run = stripEmDashes("hold on —— we're not done");
eq("run of dashes collapses to one comma", run.text, "hold on, we're not done");
count("run counts every character", run.replaced, 2);

eq("leading dash (sign-off) dropped", stripEmDashes("— Atlas, Ops at Ambitt").text, "Atlas, Ops at Ambitt");
eq("dash at line start dropped", stripEmDashes("Thanks,\n— Atlas").text, "Thanks,\nAtlas");
eq("trailing dash dropped", stripEmDashes("hang on —").text, "hang on");
eq("dash at line end dropped", stripEmDashes("hang on —\nback soon").text, "hang on\nback soon");
eq("dash before closing punctuation dropped", stripEmDashes("wait for it —.").text, "wait for it.");
eq("dash after comma → single space", stripEmDashes("yes, — and no").text, "yes, and no");
eq("dash after opening bracket dropped", stripEmDashes("(— see notes)").text, "(see notes)");
eq("unspaced dash between digits → hyphen", stripEmDashes("2024—2026 was flat").text, "2024-2026 was flat");
eq("dash alone on a line dropped", stripEmDashes("above\n—\nbelow").text, "above\n\nbelow");
eq("indentation preserved at line start", stripEmDashes("list:\n  — first item").text, "list:\n  first item");

// --- What must NOT change --------------------------------------------------

const enDash = stripEmDashes("Mon–Fri, 9–5 — that's the window.");
eq("en dashes preserved", enDash.text, "Mon–Fri, 9–5, that's the window.");
count("en dashes not counted", enDash.replaced, 1);

eq(
  "hyphens preserved",
  stripEmDashes("off-market, follow-up deals — worth a look").text,
  "off-market, follow-up deals, worth a look"
);

const noop = stripEmDashes("Nothing to do here, all clean - promise.");
eq("no-op leaves text identical", noop.text, "Nothing to do here, all clean - promise.");
count("no-op reports replaced: 0", noop.replaced, 0);

const empty = stripEmDashes("");
eq("empty string safe", empty.text, "");
count("empty string replaced: 0", empty.replaced, 0);

const nullish = stripEmDashes(undefined);
eq("undefined input safe", nullish.text, "");
count("undefined input replaced: 0", nullish.replaced, 0);
eq("null input safe", stripEmDashes(null).text, "");

eq(
  "URL in plain text left alone",
  stripEmDashes("see https://costar.com/a—b for the comp").text,
  "see https://costar.com/a—b for the comp"
);
count(
  "URL dash not counted",
  stripEmDashes("see https://costar.com/a—b for the comp").replaced,
  0
);

// --- Output hygiene: no artifacts left behind ------------------------------

const hygieneInputs = [
  "We shipped it — the client signed off.",
  "yes, — and no",
  "wait for it —.",
  "hang on —",
  "— Atlas",
  "the report—finally—arrived",
  "done — Next steps below.",
  "(— see notes)",
  "one —— two",
  "Thanks,\n— Atlas",
];
for (const input of hygieneInputs) {
  const out = stripEmDashes(input).text;
  const artifact =
    /—/.test(out) ? "em dash survived" :
    /[^\n] {2}/.test(out) ? "double space" :
    /,\s*,/.test(out) ? "double comma" :
    /[.,;:!?]\s*,/.test(out) ? "comma after punctuation" :
    /,\s*\./.test(out) ? "comma before period" :
    /\s,/.test(out) ? "space before comma" :
    /(^|\n)\s*,/.test(out) ? "leading comma" :
    /,\s*$/.test(out) ? "trailing comma" :
    null;
  check(`hygiene: "${input.replace(/\n/g, "\\n")}"`, artifact === null, `${artifact} in "${out}"`);
}

// --- HTML: markup is off limits, copy is not -------------------------------

const link = stripEmDashesHtml('<a href="https://costar.com/a—b" title="a — b">click — now</a>');
eq(
  "HTML: href + attribute untouched, text scrubbed",
  link.text,
  '<a href="https://costar.com/a—b" title="a — b">click, now</a>'
);
count("HTML: only the text-node dash counted", link.replaced, 1);

eq(
  "HTML: attribute with > inside quotes survives",
  stripEmDashesHtml('<img alt="a > b" src="x.png"><p>hi — there</p>').text,
  '<img alt="a > b" src="x.png"><p>hi, there</p>'
);

eq(
  "HTML: script contents untouched",
  stripEmDashesHtml('<script>const s = "a — b";</script><p>copy — here</p>').text,
  '<script>const s = "a — b";</script><p>copy, here</p>'
);

eq(
  "HTML: comments untouched",
  stripEmDashesHtml("<!-- keep — this --><p>drop — this</p>").text,
  "<!-- keep — this --><p>drop, this</p>"
);

const entity = stripEmDashesHtml("<p>we shipped it &mdash; they signed</p>");
eq("HTML: &mdash; entity scrubbed", entity.text, "<p>we shipped it, they signed</p>");
count("HTML: entity counted", entity.replaced, 1);

eq(
  "HTML: numeric entity scrubbed",
  stripEmDashesHtml("<p>a &#8212; b</p>").text,
  "<p>a, b</p>"
);

eq(
  "HTML: nbsp entity before dash collapses cleanly",
  stripEmDashesHtml("<p>Hello&nbsp;— world</p>").text,
  "<p>Hello, world</p>"
);

eq(
  "HTML: dash after an inline tag still becomes a comma",
  stripEmDashesHtml('<p>Top mover: <a href="https://x.co/l">1200 Main St</a> — down 8%.</p>').text,
  '<p>Top mover: <a href="https://x.co/l">1200 Main St</a>, down 8%.</p>'
);

eq(
  "HTML: dash before an inline tag still becomes a comma",
  stripEmDashesHtml("<p>one down — <strong>two to go</strong></p>").text,
  "<p>one down, <strong>two to go</strong></p>"
);

eq(
  "HTML: dash at the start of a block is dropped, not comma'd",
  stripEmDashesHtml("<p>Done for today.</p><p>— Arthur</p>").text,
  "<p>Done for today.</p><p>Arthur</p>"
);

eq(
  "HTML: dash after a <br> is dropped",
  stripEmDashesHtml("<p>line one<br>— line two</p>").text,
  "<p>line one<br>line two</p>"
);

eq(
  "HTML: space in the neighbouring node leaves no space-comma",
  stripEmDashesHtml("<p><b>the ask </b>— we're 8% under.</p>").text,
  "<p><b>the ask </b>we're 8% under.</p>"
);

// Rendered-text hygiene: strip the tags and check the copy a client would read.
const htmlHygiene = [
  '<p>Top mover: <a href="https://x.co/l">1200 Main St</a> — down 8%.</p>',
  "<p>one down — <strong>two to go</strong></p>",
  "<p><b>the ask </b>— we're 8% under.</p>",
  "<p>Done.</p><p>— Arthur</p>",
  "<p>we shipped it &mdash; they signed</p>",
  "<td>Hello&nbsp;— world</td>",
];
for (const input of htmlHygiene) {
  const rendered = stripEmDashesHtml(input)
    .text.replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ");
  const artifact =
    /—/.test(rendered) ? "em dash survived" :
    / {2}/.test(rendered) ? "double space" :
    /\s,/.test(rendered) ? "space before comma" :
    /,\s*,/.test(rendered) ? "double comma" :
    /,\s*\./.test(rendered) ? "comma before period" :
    null;
  check(`HTML hygiene: "${input.slice(0, 40)}…"`, artifact === null, `${artifact} in "${rendered}"`);
}

const htmlNoop = stripEmDashesHtml('<p style="color:#111">all clean</p>');
eq("HTML: no-op identical", htmlNoop.text, '<p style="color:#111">all clean</p>');
count("HTML: no-op replaced: 0", htmlNoop.replaced, 0);

const htmlEmpty = stripEmDashesHtml("");
eq("HTML: empty safe", htmlEmpty.text, "");
count("HTML: empty replaced: 0", htmlEmpty.replaced, 0);
eq("HTML: undefined safe", stripEmDashesHtml(undefined).text, "");

eq(
  "HTML: en dash in copy preserved",
  stripEmDashesHtml("<p>Mon–Fri — 9–5</p>").text,
  "<p>Mon–Fri, 9–5</p>"
);

// --- Wiring: the real sendSms() path scrubs before dispatch ----------------

async function wiringTests(): Promise<void> {
  process.env.TWILIO_SMS_NUMBER = "+15550001111";

  const sent: { body: string; to: string }[] = [];
  const fakeSender: SmsSender = async (args) => {
    sent.push({ body: args.body, to: args.to });
    return { sid: "SMtest" };
  };

  const sid = await sendSms(
    { to: "+15557654321", message: "Chase just texted a code — reply with the digits." },
    1,
    fakeSender
  );
  check("wiring: sendSms returned the sid", sid === "SMtest", `got "${sid}"`);
  eq(
    "wiring: sendSms scrubbed the body before dispatch",
    sent[0]?.body ?? "",
    "Chase just texted a code, reply with the digits."
  );

  await sendSms(
    { to: "+15557654321", message: "Spike detected — agent auto-paused.", audience: "operator" },
    1,
    fakeSender
  );
  eq(
    "wiring: operator-audience SMS goes out verbatim",
    sent[1]?.body ?? "",
    "Spike detected — agent auto-paused."
  );
}

// --- Wiring: the real sendEmail() path -------------------------------------
//
// The exemption from the scrub is `audience: "operator"` and nothing else.
// It used to ALSO be inferred from the recipient matching OPERATOR_EMAIL,
// which meant an agent replying to the operator skipped the voice rules purely
// because of who the human on the other end was — the operator could never see
// the copy a client would actually get. These tests pin the new gate.
//
// No network: a fake Prisma reports the agent as dryRun, so sendEmail captures
// the would-be send to dryRunLog and returns before touching Resend. The
// captured payload is byte-identical to what would have hit the inbox (the
// scrub runs before the intercept). Same trick oracle/lib/emailRouter.test.ts
// uses.

interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
}

async function emailWiringTests(): Promise<void> {
  const captured: CapturedEmail[] = [];
  const fakePrisma = {
    agent: {
      async findUnique() {
        return { dryRun: true, email: "atlas@ambitt.agency" };
      },
    },
    dryRunLog: {
      async create(args: {
        data: { payload: { to?: unknown; subject?: unknown; html?: unknown } };
      }) {
        captured.push({
          to: String(args.data.payload.to ?? ""),
          subject: String(args.data.payload.subject ?? ""),
          html: String(args.data.payload.html ?? ""),
        });
        return { id: `dr_${captured.length}`, capturedAt: new Date() };
      },
    },
  };
  (globalThis as unknown as { prisma?: unknown }).prisma = fakePrisma;

  // The operator's own address. Every send below that targets it used to be
  // exempt automatically; only the explicitly marked ones still are.
  const OPERATOR = "kylekufuor@gmail.com";
  process.env.OPERATOR_EMAIL = OPERATOR;

  const { sendEmail } = await import("./email.js");
  const base = { agentId: "agent_atlas", agentName: "Atlas" };

  // 1. The regression Kyle hit live: Atlas replies to Kyle, Kyle's address IS
  //    OPERATOR_EMAIL, and the reply arrived with its em dashes intact.
  await sendEmail({
    ...base,
    to: OPERATOR,
    subject: "Re: Atlas at Ambitt Agents — quote status",
    html: "<p>Here's where we landed — the quote went out this morning.</p>",
  });
  eq(
    "wiring: agent reply to OPERATOR_EMAIL has its subject scrubbed",
    captured[0]?.subject ?? "",
    "Re: Atlas at Ambitt Agents, quote status"
  );
  eq(
    "wiring: agent reply to OPERATOR_EMAIL has its body scrubbed",
    captured[0]?.html ?? "",
    "<p>Here's where we landed, the quote went out this morning.</p>"
  );

  // 2. Same copy, same recipient, explicitly marked a system notice: verbatim.
  await sendEmail({
    ...base,
    to: OPERATOR,
    subject: "Re: Atlas at Ambitt Agents — quote status",
    html: "<p>Here's where we landed — the quote went out this morning.</p>",
    audience: "operator",
  });
  eq(
    "wiring: operator-audience subject goes out verbatim",
    captured[1]?.subject ?? "",
    "Re: Atlas at Ambitt Agents — quote status"
  );
  eq(
    "wiring: operator-audience body goes out verbatim",
    captured[1]?.html ?? "",
    "<p>Here's where we landed — the quote went out this morning.</p>"
  );

  // 3. Ordinary client mail is unaffected — still scrubbed, as it always was.
  await sendEmail({
    ...base,
    to: "casey@acme.com",
    subject: "Atlas at Acme Realty",
    html: "<p>Three comps came back — all under ask.</p>",
  });
  eq(
    "wiring: client-facing body still scrubbed",
    captured[2]?.html ?? "",
    "<p>Three comps came back, all under ask.</p>"
  );

  // 4. The two call sites marked audience:"operator" in this change still ship
  //    their copy untouched. Their subjects/bodies are mirrored literally here
  //    because neither helper is exported (notifyOps lives inside oracle's
  //    Express app; maybeAlertExhausted inside the scheduler) — importing
  //    either module would boot a server or a cron. If those strings change,
  //    change them here too.
  const opsSubject = "Scope approved — Casey Litsey (Litsey Realty)";
  const opsHtml =
    '<p><strong style="color: #00b3b3;">Scope approved.</strong> Time to draft a quote — proposal link below.</p>';
  await sendEmail({
    ...base,
    to: OPERATOR,
    subject: opsSubject,
    html: opsHtml,
    emailType: "ops_notification",
    audience: "operator",
  });
  eq("wiring: notifyOps subject untouched", captured[3]?.subject ?? "", opsSubject);
  eq("wiring: notifyOps body untouched", captured[3]?.html ?? "", opsHtml);

  const prdSubject = "PRD generation failed (3x) — Casey Litsey (Litsey Realty)";
  const prdHtml =
    "<p><strong>PRD generation failed 3 times.</strong> Manual investigation needed — Atlas keeps producing invalid output for this intake.</p>";
  await sendEmail({
    ...base,
    to: OPERATOR,
    subject: prdSubject,
    html: prdHtml,
    emailType: "ops_notification",
    audience: "operator",
  });
  eq("wiring: PRD-exhausted alert subject untouched", captured[4]?.subject ?? "", prdSubject);
  eq("wiring: PRD-exhausted alert body untouched", captured[4]?.html ?? "", prdHtml);

  // 5. And the flag is what's doing the work — drop it and the same ops copy
  //    gets rewritten, even though the recipient is still OPERATOR_EMAIL.
  //    (Dash before a capital reads as a clause break, so it lands as a period.)
  await sendEmail({ ...base, to: OPERATOR, subject: opsSubject, html: opsHtml });
  eq(
    "wiring: without the flag, the operator address no longer exempts anything",
    captured[5]?.subject ?? "",
    "Scope approved. Casey Litsey (Litsey Realty)"
  );
}

wiringTests()
  .then(emailWiringTests)
  .then(() => {
    console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
    process.exitCode = fail ? 1 : 0;
  });
