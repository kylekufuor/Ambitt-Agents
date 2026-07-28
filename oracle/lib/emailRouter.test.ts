// Run: node_modules/.bin/tsx oracle/lib/emailRouter.test.ts
//
// Router-level test for the outbound seatbelt SCOPE (control-plane Pillar 4):
// which triggers the gate covers, and which mail must always go out even when
// the agent is over its cap.
//
// No server, no real DB, no network:
//   - a fake Prisma client is installed on globalThis BEFORE shared/db.ts is
//     first imported (db.ts reads globalThis.prisma before constructing one),
//     so every prisma call in the router, the seatbelt and haltAgent hits the
//     in-memory fake;
//   - the fake reports the agent as dryRun, so shared/email.ts captures the
//     would-be send to dryRunLog and returns without ever calling Resend. A
//     captured row therefore means "this email was sent";
//   - every outbound-channel env var is cleared first, so the operator alert on
//     a trip degrades to "no channel" instead of texting or emailing anyone.
//
// Everything below is deliberately dynamic-import ordered — nothing that reads
// env or touches the DB may be statically imported.

import type { EmailProps } from "./emailRouter.js";

// --- 1. Neutralize every outbound channel before any module loads ----------
for (const k of [
  "RESEND_API_KEY",
  "OPERATOR_EMAIL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_NUMBER",
  "TWILIO_WHATSAPP_NUMBER",
  "KYLE_WHATSAPP_NUMBER",
  "CHAT_TOKEN_SECRET",
]) {
  delete process.env[k];
}

// --- 2. In-memory Prisma stand-in ------------------------------------------
interface FakeSend {
  agentId: string;
  to: string;
  subject: string;
  acceptedAt: Date;
}

interface SendWhere {
  agentId?: string;
  to?: string;
  acceptedAt?: { gte?: Date };
}

interface AgentRow {
  status: string;
  pausedBy: string | null;
  pausedReason: string | null;
}

const AGENT = "agent_seatbelt";
const CLIENT = "client_1";
const NAME = "Arthur";
const TO = "casey@acme.com";

// Mutable test state, reset before each case.
let history: FakeSend[] = [];
let captured: Array<{ to: string; subject: string }> = [];
let agentRow: AgentRow = { status: "active", pausedBy: null, pausedReason: null };
// Per-agent seatbelt config the router resolves off the Agent row.
let agentConfig: { communicationSettings: unknown; safetySensitivity: string | null } = {
  communicationSettings: null,
  safetySensitivity: null,
};

const matches = (r: FakeSend, where: SendWhere): boolean => {
  if (where.agentId !== undefined && r.agentId !== where.agentId) return false;
  if (where.to !== undefined && r.to !== where.to) return false;
  if (where.acceptedAt?.gte !== undefined && r.acceptedAt < where.acceptedAt.gte) return false;
  return true;
};

const fakePrisma = {
  agent: {
    // Serves three callers with three different selects (router → clientId,
    // haltAgent → status/pausedBy, sendEmail → dryRun/email). Returning the
    // superset row satisfies all of them.
    async findUnique(_args: { where: { id: string } }) {
      return {
        clientId: CLIENT,
        status: agentRow.status,
        pausedBy: agentRow.pausedBy,
        // dryRun keeps sendEmail off the network — the capture below IS the send.
        dryRun: true,
        email: `${NAME.toLowerCase()}@ambitt.agency`,
        // Per-agent seatbelt config (operator sensitivity + explicit overrides).
        communicationSettings: agentConfig.communicationSettings,
        safetySensitivity: agentConfig.safetySensitivity,
      };
    },
    async update(args: { where: { id: string }; data: Record<string, unknown> }) {
      const d = args.data;
      if (typeof d.status === "string") agentRow.status = d.status;
      if (typeof d.pausedBy === "string") agentRow.pausedBy = d.pausedBy;
      if (typeof d.pausedReason === "string") agentRow.pausedReason = d.pausedReason;
      return agentRow;
    },
  },
  emailSend: {
    async count(args: { where: SendWhere }) {
      return history.filter((r) => matches(r, args.where)).length;
    },
    async findMany(args: { where: SendWhere }) {
      return history.filter((r) => matches(r, args.where)).map((r) => ({ subject: r.subject }));
    },
  },
  dryRunLog: {
    async create(args: { data: { payload: { to?: unknown; subject?: unknown } } }) {
      captured.push({
        to: String(args.data.payload.to ?? ""),
        subject: String(args.data.payload.subject ?? ""),
      });
      return { id: `dr_${captured.length}`, capturedAt: new Date() };
    },
  },
};

const g = globalThis as unknown as { prisma?: unknown };
g.prisma = fakePrisma;

// --- 3. Props builders (one valid payload per trigger) ----------------------
const base = { agentId: AGENT, agentName: NAME, clientId: CLIENT, clientName: "Casey", productName: "Ambitt Agents" };

// The two approval emails, parameterized by the ASK — that's what the subject
// now carries and what the seatbelt's repetition check keys on.
const approvalAsk = (summary: string): EmailProps => ({
  trigger: "action-required",
  to: TO,
  ...base,
  summary,
  actionSteps: [{ step: "Email 12 owners" }],
  reasoning: "They all match the brief.",
  impactStatement: "These changes will be made on your behalf once you approve.",
  approveActionId: "act_1",
  ctaUrl: "mailto:reply-x@ambitt.agency?subject=APPROVE%20act_1",
});

const accessAsk = (app: string): EmailProps => ({
  trigger: "permission",
  to: TO,
  ...base,
  summary: `I need access to your ${app} account to send the outreach. Click below to authorize.`,
  permissions: [{ toolName: app, accessLevel: "OAuth", description: `Send outreach from your ${app}.` }],
  intentSteps: [{ step: "Send the approved outreach" }],
  approveActionId: "perm_1",
  ctaUrl: "https://oracle.ambitt.agency/composio/connect",
});

// credential-request already names the item in its subject; parameterized here
// so the "different asks don't trip" property is checked for it too.
const credentialAsk = (itemTitle: string): EmailProps => ({
  trigger: "credential-request",
  to: TO,
  ...base,
  summary: `I need your ${itemTitle} login to finish the run.`,
  itemTitle,
  fieldTitles: ["username", "password"],
  openUrl: "https://portal.ambitt.agency/agents/x/tools",
  approveActionId: "cred_1",
});

const propsFor: Record<string, () => EmailProps> = {
  "agent-response": () => ({
    trigger: "agent-response",
    to: TO,
    agentId: AGENT,
    agentName: NAME,
    agentRole: "CRE sourcing",
    clientBusinessName: "Acme",
    responseBody: "Here are the three comps you asked for.",
    toolsUsed: [],
  }),
  "credential-request": () => ({
    trigger: "credential-request",
    to: TO,
    ...base,
    summary: "I need your CoStar login to pull the comps.",
    itemTitle: "CoStar",
    fieldTitles: ["username", "password"],
    openUrl: "https://portal.ambitt.agency/agents/x/tools",
    approveActionId: "cred_1",
  }),
  "action-required": () => approvalAsk("I'd like to send the outreach list to 12 owners."),
  permission: () => accessAsk("Gmail"),
  welcome: () => ({
    trigger: "welcome",
    to: TO,
    agentId: AGENT,
    agentName: NAME,
    agentPurpose: "Source CRE deals",
    clientFirstName: "Casey",
    clientBusinessName: "Acme",
    tools: [],
    capabilities: [],
  }),
  error: () => ({
    trigger: "error",
    to: TO,
    ...base,
    summary: "A tool call failed and I couldn't finish the run.",
    errorCode: "TOOL_TIMEOUT",
    errorMessage: "CoStar export timed out",
    errorTime: new Date().toISOString(),
    recoverySteps: [{ step: "Retry the run" }],
    sourceLinks: [],
    retryActionId: "err_1",
    ctaUrl: "https://portal.ambitt.agency",
  }),
  alert: () => ({
    trigger: "alert",
    to: TO,
    ...base,
    summary: "Outbound volume spiked.",
    metricValue: "31",
    metricLabel: "Emails sent",
    metricDelta: "+310%",
    detectedAt: new Date().toISOString(),
    checksTable: [],
    sourceLinks: [],
    ctaUrl: "https://portal.ambitt.agency",
  }),
};

// Subjects the router builds, needed to seed repetition cases. Written out
// literally (not re-derived from the code under test) so the client-facing copy
// is pinned here: the approval subjects name the ASK, they are not constants.
const SUBJECT = {
  "credential-request": `${NAME} needs your CoStar login`,
  "action-required": `${NAME} — approve: send the outreach list to 12 owners`,
  permission: `${NAME} — access needed: Gmail`,
  welcome: `Meet ${NAME} — your new Ambitt agent for Acme`,
};

// --- 4. Seeds --------------------------------------------------------------
const ago = (mins: number, over: Partial<FakeSend> = {}): FakeSend => ({
  agentId: AGENT,
  to: TO,
  subject: "Weekly report",
  acceptedAt: new Date(Date.now() - mins * 60_000),
  ...over,
});

// 6 sends inside the 15-min window == shortMax -> rate_short trips for any
// gated trigger, whatever its subject.
const OVER_CAP: FakeSend[] = Array.from({ length: 6 }, (_, i) => ago(i + 1, { subject: `s${i}` }));

// 2 identical subjects to the same recipient == repetitionMax, and few enough
// sends that the rate checks stay quiet.
const repeated = (subject: string): FakeSend[] => [ago(5, { subject }), ago(10, { subject })];

interface Case {
  name: string;
  trigger: keyof typeof propsFor;
  seed: FakeSend[];
  wantSent: boolean;
  wantHalted: boolean;
  // Exact subject the client should see (checked when the send goes through).
  wantSubject?: string;
  // Per-agent seatbelt config for this case (operator sensitivity dial +
  // explicit CommunicationSettings.seatbelts overrides).
  sensitivity?: string;
  commSettings?: unknown;
}

const cases: Case[] = [
  // --- GATED: agent-initiated, client-facing ---
  { name: "agent-response over cap -> blocked + halted", trigger: "agent-response", seed: OVER_CAP, wantSent: false, wantHalted: true },
  { name: "credential-request over cap -> blocked + halted", trigger: "credential-request", seed: OVER_CAP, wantSent: false, wantHalted: true },
  { name: "action-required over cap -> blocked + halted", trigger: "action-required", seed: OVER_CAP, wantSent: false, wantHalted: true },
  { name: "permission over cap -> blocked + halted", trigger: "permission", seed: OVER_CAP, wantSent: false, wantHalted: true },

  // Repetition (the real loop signal), per gated trigger that has a distinct subject.
  {
    name: "credential-request repeated subject -> blocked + halted",
    trigger: "credential-request",
    seed: repeated(SUBJECT["credential-request"]),
    wantSent: false,
    wantHalted: true,
  },
  {
    name: "action-required repeated subject -> blocked + halted",
    trigger: "action-required",
    seed: repeated(SUBJECT["action-required"]),
    wantSent: false,
    wantHalted: true,
  },
  {
    name: "permission repeated subject -> blocked + halted",
    trigger: "permission",
    seed: repeated(SUBJECT.permission),
    wantSent: false,
    wantHalted: true,
  },

  // Under cap the gate must be invisible. wantSubject pins the copy the client
  // sees — each approval subject names its ask.
  { name: "agent-response under cap -> sent", trigger: "agent-response", seed: [], wantSent: true, wantHalted: false },
  { name: "credential-request under cap -> sent", trigger: "credential-request", seed: [], wantSent: true, wantHalted: false, wantSubject: SUBJECT["credential-request"] },
  { name: "action-required under cap -> sent", trigger: "action-required", seed: [], wantSent: true, wantHalted: false, wantSubject: SUBJECT["action-required"] },
  { name: "permission under cap -> sent", trigger: "permission", seed: [], wantSent: true, wantHalted: false, wantSubject: SUBJECT.permission },
  { name: "credential-request under cap w/ 1 prior identical -> sent", trigger: "credential-request", seed: [ago(5, { subject: SUBJECT["credential-request"] })], wantSent: true, wantHalted: false },

  // --- Per-agent seatbelt config: the router honours the agent's own caps ---
  // 3 sends in 15 min is under the global shortMax (6) but over a "strict"
  // agent's halved cap, and 6 is over the global cap but under a "relaxed"
  // agent's doubled one. Both only pass if the router resolves the agent row.
  { name: "strict agent trips at half the global rate cap", trigger: "action-required", seed: OVER_CAP.slice(0, 3), wantSent: false, wantHalted: true, sensitivity: "strict" },
  { name: "standard agent at the same volume -> sent", trigger: "action-required", seed: OVER_CAP.slice(0, 3), wantSent: true, wantHalted: false },
  { name: "relaxed agent survives the global rate cap", trigger: "action-required", seed: OVER_CAP, wantSent: true, wantHalted: false, sensitivity: "relaxed" },
  {
    name: "explicit per-agent shortMax override wins",
    trigger: "action-required",
    seed: OVER_CAP.slice(0, 2),
    wantSent: false,
    wantHalted: true,
    commSettings: { seatbelts: { shortMax: 2 } },
  },

  // --- UNGATED: system / lifecycle mail must always send ---
  { name: "welcome over cap -> still sent", trigger: "welcome", seed: OVER_CAP, wantSent: true, wantHalted: false },
  { name: "error over cap -> still sent", trigger: "error", seed: OVER_CAP, wantSent: true, wantHalted: false },
  { name: "alert over cap -> still sent", trigger: "alert", seed: OVER_CAP, wantSent: true, wantHalted: false },
  { name: "welcome with repeated subject -> still sent", trigger: "welcome", seed: repeated(SUBJECT.welcome), wantSent: true, wantHalted: false },
  { name: "error over cap AND repeated subject -> still sent", trigger: "error", seed: [...OVER_CAP, ...repeated(`${NAME} — Error: TOOL_TIMEOUT`)], wantSent: true, wantHalted: false },
];

async function main() {
  const { default: logger } = await import("../../shared/logger.js");
  // The blocked cases log a warn + an operator-alert error by design; silence
  // the transport so only test output lands on stdout.
  logger.silent = true;

  const { sendAgentEmail } = await import("./emailRouter.js");

  let pass = 0;
  let fail = 0;
  const chk = (name: string, ok: boolean, detail?: string) => {
    if (ok) pass++;
    else {
      fail++;
      console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
    }
  };

  for (const c of cases) {
    history = [...c.seed];
    captured = [];
    agentRow = { status: "active", pausedBy: null, pausedReason: null };
    agentConfig = { communicationSettings: c.commSettings ?? null, safetySensitivity: c.sensitivity ?? null };

    let threw: string | null = null;
    try {
      await sendAgentEmail(propsFor[c.trigger]());
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }

    const sent = captured.length > 0;
    const halted = agentRow.status === "paused";
    const ok = threw === null && sent === c.wantSent && halted === c.wantHalted;
    chk(
      c.name,
      ok,
      ok
        ? undefined
        : `got sent=${sent} halted=${halted} pausedBy=${agentRow.pausedBy ?? "-"} threw=${threw ?? "-"}\n        want sent=${c.wantSent} halted=${c.wantHalted}`,
    );

    // A halt raised by the seatbelt is always a SYSTEM pause (operator-only resume).
    if (c.wantHalted && halted) {
      chk(
        `${c.name} :: pausedBy=system + seatbelt reason`,
        agentRow.pausedBy === "system" && (agentRow.pausedReason ?? "").startsWith("seatbelt:"),
        `got pausedBy=${agentRow.pausedBy ?? "-"} reason="${agentRow.pausedReason ?? ""}"`,
      );
    }

    if (c.wantSubject && sent) {
      chk(
        `${c.name} :: subject`,
        captured[0].subject === c.wantSubject,
        `got  "${captured[0].subject}"\n        want "${c.wantSubject}"`,
      );
    }
  }

  // --- Repetition keys on the ASK, not on the trigger ------------------------
  // THE regression this file exists to hold down. Supervised mode is the
  // default, so an agent that makes several DIFFERENT approval asks in one
  // session is doing its job — it must not be system-paused for it. A genuine
  // loop (the same ask, over and over) must still be caught.
  //
  // Each send is run through the real router in order, and every accepted send
  // is written back into the fake EmailSend history exactly as a real send
  // would be, so send N sees sends 1..N-1 the way production does.
  interface SeqCase {
    name: string;
    sends: EmailProps[];
    wantSent: boolean[];
    wantSubjects: string[];
    wantHalted: boolean;
  }

  const sequences: SeqCase[] = [
    {
      name: "3 DIFFERENT approval asks in 30 min",
      sends: [
        approvalAsk("I'd like to send the outreach list to 12 owners."),
        approvalAsk("I'd like to book a tour of 400 Main St for Thursday."),
        approvalAsk("I'd like to archive the 6 listings that went under contract."),
      ],
      wantSent: [true, true, true],
      wantSubjects: [
        `${NAME} — approve: send the outreach list to 12 owners`,
        `${NAME} — approve: book a tour of 400 Main St for Thursday`,
        `${NAME} — approve: archive the 6 listings that went under contract`,
      ],
      wantHalted: false,
    },
    {
      name: "the SAME approval ask 3x in 30 min",
      sends: [
        approvalAsk("I'd like to send the outreach list to 12 owners."),
        approvalAsk("I'd like to send the outreach list to 12 owners."),
        approvalAsk("I'd like to send the outreach list to 12 owners."),
      ],
      wantSent: [true, true, false],
      wantSubjects: [SUBJECT["action-required"], SUBJECT["action-required"]],
      wantHalted: true,
    },
    {
      name: "3 DIFFERENT access asks in 30 min",
      sends: [accessAsk("HubSpot"), accessAsk("Gmail"), accessAsk("Slack")],
      wantSent: [true, true, true],
      wantSubjects: [`${NAME} — access needed: HubSpot`, `${NAME} — access needed: Gmail`, `${NAME} — access needed: Slack`],
      wantHalted: false,
    },
    {
      // credential-request needed no change — its subject already carries the
      // item. Pinned here so a future edit can't quietly make it constant.
      name: "3 DIFFERENT credential asks in 30 min",
      sends: [credentialAsk("CoStar"), credentialAsk("LinkedIn"), credentialAsk("Crexi")],
      wantSent: [true, true, true],
      wantSubjects: [`${NAME} needs your CoStar login`, `${NAME} needs your LinkedIn login`, `${NAME} needs your Crexi login`],
      wantHalted: false,
    },
    {
      name: "the SAME access ask 3x in 30 min",
      sends: [accessAsk("HubSpot"), accessAsk("HubSpot"), accessAsk("HubSpot")],
      wantSent: [true, true, false],
      wantSubjects: [`${NAME} — access needed: HubSpot`, `${NAME} — access needed: HubSpot`],
      wantHalted: true,
    },
  ];

  for (const s of sequences) {
    history = [];
    captured = [];
    agentRow = { status: "active", pausedBy: null, pausedReason: null };
    agentConfig = { communicationSettings: null, safetySensitivity: null };

    const gotSent: boolean[] = [];
    let threw: string | null = null;
    for (const send of s.sends) {
      const before = captured.length;
      try {
        await sendAgentEmail(send);
      } catch (e) {
        threw ??= e instanceof Error ? e.message : String(e);
      }
      const accepted = captured.length > before;
      gotSent.push(accepted);
      // Mirror what a real (non-dry-run) send does: log the EmailSend row the
      // next seatbelt check reads.
      if (accepted) history.push({ agentId: AGENT, to: TO, subject: captured[captured.length - 1].subject, acceptedAt: new Date() });
    }

    const halted = agentRow.status === "paused";
    const gotSubjects = captured.map((c) => c.subject);
    const okSent = threw === null && gotSent.join() === s.wantSent.join() && halted === s.wantHalted;
    chk(
      `${s.name} -> sent ${s.wantSent.map((b) => (b ? "y" : "n")).join("")}, halted=${s.wantHalted}`,
      okSent,
      `got sent=${gotSent.join()} halted=${halted} threw=${threw ?? "-"}\n        want sent=${s.wantSent.join()} halted=${s.wantHalted}`,
    );
    chk(
      `${s.name} :: subjects`,
      gotSubjects.join(" | ") === s.wantSubjects.join(" | "),
      `got  ${JSON.stringify(gotSubjects)}\n        want ${JSON.stringify(s.wantSubjects)}`,
    );
  }

  // The operator alert must degrade cleanly when no channel is configured
  // (today's prod reality: SMS is A2P-blocked, Twilio unset) and never throw.
  {
    const { alertOperator } = await import("../../shared/alert-operator.js");
    let result: string | null = null;
    let threw: string | null = null;
    try {
      result = await alertOperator("seatbelt test alert");
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    chk(
      "alertOperator degrades to no-channel without throwing",
      threw === null && result === "no-channel",
      `got result=${result ?? "-"} threw=${threw ?? "-"}`,
    );
  }

  console.log(`\n${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : " — all green"}`);
  process.exitCode = fail ? 1 : 0;
}

main();
