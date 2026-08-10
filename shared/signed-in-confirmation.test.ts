// Run: node_modules/.bin/tsx shared/signed-in-confirmation.test.ts
// Covers the "I'm in and working" text that closes the 2FA loop. Pure unit
// test — fake db + fake sender, no Twilio, no network. State in mfa-relay is
// module-global, so every case uses its own clientId.
import {
  recordSmsAsk,
  takeSignInConfirmation,
  clearSignInConfirmation,
  notifySignedIn,
  SIGNIN_CONFIRM_TTL_MS,
  type RelayDeps,
} from "./mfa-relay.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`        got  ${g}`);
    console.log(`        want ${w}`);
  }
}

interface Sent { to: string; message: string }

function deps(opts: { dryRun?: boolean; smsRows?: number; configured?: boolean; throwOnSend?: boolean } = {}) {
  const sent: Sent[] = [];
  const dryLogs: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
  const d = {
    db: {
      agent: {
        findUnique: async () => ({
          name: "Arthur",
          dryRun: opts.dryRun ?? false,
          communicationSettings: null,
          safetySensitivity: null,
          client: { businessName: "Litsey Real Estate" },
        }),
      },
      smsSend: {
        create: async ({ data }: { data: Record<string, unknown> }) => { audit.push(data); return data; },
        count: async () => opts.smsRows ?? 0,
      },
      dryRunLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => { dryLogs.push(data); return data; },
      },
    },
    sendSms: async (a: { to: string; message: string }) => {
      if (opts.throwOnSend) throw new Error("twilio down");
      sent.push({ to: a.to, message: a.message });
      return "SM_fake";
    },
    smsConfigured: async () => opts.configured ?? true,
    alertOperator: async () => {},
    haltAgent: async () => {},
  } as unknown as RelayDeps;
  return { d, sent, dryLogs, audit };
}

const ASK = { phone: "+19188575961", agentId: "agent_1", service: "CoStar" };

async function main() {
  // --- the debt is created by the ask, not the reply -------------------------
  {
    const { d, sent } = deps();
    const r = await notifySignedIn({ clientId: "c_none", service: "CoStar" }, d);
    check("no ask → no text", r, { sent: false, reason: "no_outstanding_ask" });
    check("no ask → nothing sent", sent.length, 0);
  }

  {
    const { d, sent } = deps();
    recordSmsAsk("c_happy", ASK);
    const r = await notifySignedIn({ clientId: "c_happy", service: "CoStar" }, d);
    check("asked then signed in → sent", r.sent, true);
    check("...to the number we asked", sent[0]?.to, "+19188575961");
    check("...says who it is", sent[0]?.message.startsWith("Arthur here."), true);
    check("...names the service he answered for", sent[0]?.message.includes("CoStar"), true);
    check("...tells him he's done", sent[0]?.message.includes("Nothing else needed from you"), true);
    check("...no em dashes in the copy", /—/.test(sent[0]?.message ?? ""), false);
  }

  // --- one ask, one answer, ever ---------------------------------------------
  {
    const { d, sent } = deps();
    recordSmsAsk("c_once", ASK);
    await notifySignedIn({ clientId: "c_once", service: "CoStar" }, d);
    const second = await notifySignedIn({ clientId: "c_once", service: "CoStar" }, d);
    check("second call sends nothing", second, { sent: false, reason: "no_outstanding_ask" });
    check("...exactly one text total", sent.length, 1);
  }

  // --- stale asks go quiet ---------------------------------------------------
  {
    const { d, sent } = deps();
    const longAgo = Date.now() - SIGNIN_CONFIRM_TTL_MS - 1000;
    recordSmsAsk("c_stale", ASK, longAgo);
    const r = await notifySignedIn({ clientId: "c_stale", service: "CoStar" }, d);
    check("expired ask → no text", r, { sent: false, reason: "no_outstanding_ask" });
    check("...nothing sent", sent.length, 0);
  }

  // --- a failed login must not leave the debt lying around --------------------
  {
    const { d, sent } = deps();
    recordSmsAsk("c_failed", ASK);
    clearSignInConfirmation("c_failed");
    const r = await notifySignedIn({ clientId: "c_failed", service: "CoStar" }, d);
    check("cleared after failure → no text", r.sent, false);
    check("...nothing sent", sent.length, 0);
  }

  // --- dry run captures, never sends -----------------------------------------
  {
    const { d, sent, dryLogs } = deps({ dryRun: true });
    recordSmsAsk("c_dry", ASK);
    const r = await notifySignedIn({ clientId: "c_dry", service: "CoStar" }, d);
    check("dry run → not sent", r, { sent: false, reason: "dry_run" });
    check("...nothing left the platform", sent.length, 0);
    check("...but it was captured", dryLogs.length, 1);
    check("...tagged as the sign-in confirmation", (dryLogs[0]?.payload as { purpose?: string })?.purpose, "2fa_signed_in");
  }

  // --- the seatbelt still applies --------------------------------------------
  {
    const { d, sent } = deps({ smsRows: 99 });
    recordSmsAsk("c_cap", ASK);
    const r = await notifySignedIn({ clientId: "c_cap", service: "CoStar" }, d);
    check("over the cap → not sent", r, { sent: false, reason: "over_cap" });
    check("...nothing sent", sent.length, 0);
  }

  {
    const { d, sent } = deps({ configured: false });
    recordSmsAsk("c_unconf", ASK);
    const r = await notifySignedIn({ clientId: "c_unconf", service: "CoStar" }, d);
    check("SMS not configured → not sent", r, { sent: false, reason: "not_configured" });
    check("...nothing sent", sent.length, 0);
  }

  // --- never throws, whatever Twilio does ------------------------------------
  {
    const { d } = deps({ throwOnSend: true });
    recordSmsAsk("c_boom", ASK);
    const r = await notifySignedIn({ clientId: "c_boom", service: "CoStar" }, d);
    check("send failure is swallowed", r, { sent: false, reason: "send_failed" });
  }

  // --- the audit row is written ----------------------------------------------
  {
    const { d, audit } = deps();
    recordSmsAsk("c_audit", ASK);
    await notifySignedIn({ clientId: "c_audit", service: "CoStar" }, d);
    check("audit row written", audit.length, 1);
    check("...its own kind, not sms_2fa", audit[0]?.kind, "sms_2fa_signed_in");
    check("...last 4 only, never the number", audit[0]?.toLast4, "5961");
  }

  // --- the text names the service he was ASKED about -------------------------
  {
    const { d, sent } = deps();
    recordSmsAsk("c_svc", { ...ASK, service: "CoStar" });
    // Caller passes a different tool name; the ask wins, because that is the
    // one he answered a code for.
    await notifySignedIn({ clientId: "c_svc", service: "Crexi" }, d);
    check("service comes from the ask", sent[0]?.message.includes("CoStar"), true);
    check("...not from the caller", sent[0]?.message.includes("Crexi"), false);
  }

  // --- takeSignInConfirmation is the consuming primitive ---------------------
  {
    recordSmsAsk("c_prim", ASK);
    const first = takeSignInConfirmation("c_prim");
    check("take returns the ask", first?.phone, "+19188575961");
    check("take consumes it", takeSignInConfirmation("c_prim"), null);
  }

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}
main();
