// @ts-nocheck
import { chromium } from "playwright";
import path from "path";
import os from "os";
import { decideA11yAction } from "../shared/runtime/browser-brain-a11y.js";

// ---------------------------------------------------------------------------
// Arthur Remote Hands — worker
// ---------------------------------------------------------------------------
// Launches the REAL Google Chrome with a persistent profile (a logged-in
// session survives across runs), and drives it a11y-first: distill the page
// into interactive elements + text, ask Arthur's brain for the next action,
// execute it with Playwright, repeat. Handles deterministic self-login (creds
// resolved from the platform, typed directly, never shown to the model) and
// email MFA relay (asks the client to reply with the CoStar code).
//
//   CLI mode:    npx tsx remote-hands/worker.ts "<goal>" [startingUrl]
//   Queue mode:  AMBITT_DEVICE_TOKEN=... npx tsx remote-hands/worker.ts --queue
// ---------------------------------------------------------------------------

const ORACLE_URL = process.env.ORACLE_URL || "https://oracle-production-c0ff.up.railway.app";
const DEVICE_TOKEN = process.env.AMBITT_DEVICE_TOKEN || "";
const MAX_STEPS = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Distilled snapshot, run as a RAW STRING (tsx/esbuild would inject a __name
// helper into a passed function and break it in-browser). Tags each visible
// interactive element with data-rh="<ref>" (re-tagged each step).
const DISTILL_SRC = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return !(s.visibility === "hidden" || s.display === "none" || +s.opacity === 0); };
  const nm = (el) => (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title") || el.getAttribute("alt") || (el.innerText || el.value || "").replace(/\\s+/g, " ").trim()).slice(0, 120);
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=option], [role=combobox], [contenteditable=true], [onclick], [tabindex]:not([tabindex="-1"])';
  document.querySelectorAll("[data-rh]").forEach((e) => e.removeAttribute("data-rh"));
  const els = []; let ref = 0;
  const collect = (root) => { let list; try { list = root.querySelectorAll("*"); } catch (e) { return; } list.forEach((el) => { if (el.matches && el.matches(sel) && vis(el)) { el.setAttribute("data-rh", String(ref)); els.push({ ref: ref, tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", type: el.getAttribute("type") || "", name: nm(el) }); ref++; } if (el.shadowRoot) collect(el.shadowRoot); }); };
  collect(document);
  const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 8000);
  return { url: location.href, title: document.title, elements: els, text };
})()`;

async function api(p, { method = "GET", body } = {}) {
  const res = await fetch(ORACLE_URL + p, {
    method,
    headers: { "Content-Type": "application/json", "X-Device-Token": DEVICE_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function snapshot(page) {
  try {
    return await page.evaluate(DISTILL_SRC);
  } catch (e) {
    await sleep(1200);
    return await page.evaluate(DISTILL_SRC).catch(() => ({ url: page.url(), title: "", elements: [], text: "" }));
  }
}

function looksLikeLogin(snap) {
  return snap.elements.some((e) => e.type === "password");
}
function looksLikeMfa(snap) {
  const t = (snap.text || "").toLowerCase();
  const textual = /(verification|security|one[- ]?time|authentication) code|enter the code|we (sent|texted|emailed) (you )?a code|two[- ]?factor/.test(t);
  const codeField = snap.elements.some((e) => e.tag === "input" && /code|otp|token|verif/i.test(e.name));
  return codeField || (textual && snap.elements.some((e) => e.tag === "input" && e.type !== "password"));
}

// Deterministic login — creds resolved from the platform, typed directly, never
// shown to the model. Handles single-step and 2-step (username → next → password).
async function doLogin(page, snap, taskId, tool) {
  if (!taskId) { console.log("  login page, but CLI mode has no creds to resolve."); return false; }
  const { ok, body } = await api(`/extension/tasks/${taskId}/resolve-cred`, { method: "POST", body: { tool } });
  if (!ok || !body.fields) { console.log(`  login: no stored creds for ${tool}`); return false; }
  const { username, password } = body.fields;
  const fill = async (ref, val) => { try { const l = page.locator(`[data-rh="${ref}"]`).first(); await l.click({ timeout: 6000 }); await l.fill(val); } catch (e) {} };
  const click = async (ref) => { try { await page.locator(`[data-rh="${ref}"]`).first().click({ timeout: 6000 }); } catch (e) {} };

  const userEl = snap.elements.find((e) => e.tag === "input" && (e.type === "email" || e.type === "text" || /user|email|login/i.test(e.name)));
  if (userEl && username) await fill(userEl.ref, username);

  let pwEl = snap.elements.find((e) => e.type === "password");
  if (!pwEl) {
    const next = snap.elements.find((e) => /next|continue|sign ?in|log ?in|login/i.test(e.name));
    if (next) { await click(next.ref); await sleep(2000); }
    snap = await snapshot(page);
    pwEl = snap.elements.find((e) => e.type === "password");
  }
  if (pwEl && password) await fill(pwEl.ref, password);

  const submit = snap.elements.find((e) => (e.tag === "button" || e.type === "submit") && /sign ?in|log ?in|login|submit|continue|next/i.test(e.name))
    || snap.elements.find((e) => /sign ?in|log ?in|login|submit|continue|next/i.test(e.name));
  if (submit) await click(submit.ref);
  else { try { await page.keyboard.press("Enter"); } catch (e) {} }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(2500);
  console.log(`  login: submitted ${tool} credentials.`);
  return true;
}

// MFA — ask the platform to email the client, poll for the code, enter it.
async function doMfa(page, snap, taskId, service) {
  if (!taskId) { console.log("  MFA screen, but CLI mode can't relay."); return false; }
  const codeEl =
    snap.elements.find((e) => e.tag === "input" && /code|otp|token|verif/i.test(e.name)) ||
    snap.elements.find((e) => e.tag === "input" && ["text", "tel", "number", ""].includes(e.type));
  if (!codeEl) { console.log("  MFA: no code field found."); return false; }
  console.log(`  MFA: emailing ${service} code request to the client…`);
  await api(`/extension/tasks/${taskId}/need-2fa`, { method: "POST", body: { service } });
  let code = null;
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const { body } = await api(`/extension/tasks/${taskId}/2fa-code`);
    if (body && body.code) { code = body.code; break; }
  }
  if (!code) { console.log("  MFA: no code received (timed out waiting for the reply)."); return false; }
  console.log("  MFA: got the code, entering it…");
  try { const l = page.locator(`[data-rh="${codeEl.ref}"]`).first(); await l.click({ timeout: 6000 }); await l.fill(code); } catch (e) {}
  const submit = snap.elements.find((e) => /verify|submit|continue|sign in|confirm/i.test(e.name));
  if (submit) { try { await page.locator(`[data-rh="${submit.ref}"]`).first().click({ timeout: 6000 }); } catch (e) {} }
  else { try { await page.keyboard.press("Enter"); } catch (e) {} }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(2500);
  return true;
}

async function runA11yLoop(page, goal, { taskId, tool } = {}) {
  const history = [];
  let outcome = { ok: false, text: "No result." };
  let handledAuth = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    await sleep(800);
    let snap = await snapshot(page);
    if (step === 0) console.log(`(distilled ${snap.elements.length} interactive elements)`);

    // Deterministic auth prechecks (login + MFA), before handing to the brain.
    if (!handledAuth && looksLikeMfa(snap)) { await doMfa(page, snap, taskId, tool || "your tool"); history.push({ action: "mfa" }); continue; }
    if (!handledAuth && looksLikeLogin(snap)) { handledAuth = await doLogin(page, snap, taskId, tool || "CoStar"); history.push({ action: "login" }); continue; }

    const action = await decideA11yAction({ goal, url: snap.url, title: snap.title, elements: snap.elements, text: snap.text, history, stepIndex: step });
    const label = snap.elements.find((e) => e.ref === action.ref)?.name;
    console.log(
      `step ${step + 1}: ${action.action}` +
        (action.ref != null ? ` #${action.ref}${label ? ` "${label}"` : ""}` : "") +
        (action.text ? ` "${action.text.slice(0, 40)}"` : "") +
        (action.reason ? ` — ${action.reason}` : "")
    );
    if (action.action === "done") { outcome = { ok: true, text: action.result || "Done." }; break; }
    if (action.action === "fail") { outcome = { ok: false, text: action.reason || "The agent could not finish." }; break; }

    try {
      if (action.action === "click") {
        await page.locator(`[data-rh="${action.ref}"]`).first().click({ timeout: 8000 });
        history.push({ action: `click #${action.ref}`, note: label });
      } else if (action.action === "type") {
        const l = page.locator(`[data-rh="${action.ref}"]`).first();
        await l.click({ timeout: 8000 });
        await l.fill(action.text || "");
        history.push({ action: `type "${String(action.text || "").slice(0, 40)}" #${action.ref}` });
      } else if (action.action === "press") {
        await page.keyboard.press(action.key || "Enter");
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        history.push({ action: `press ${action.key || "Enter"}` });
      } else if (action.action === "scroll") {
        await page.mouse.wheel(0, action.dir === "up" ? -700 : 700);
        history.push({ action: `scroll ${action.dir || "down"}` });
      } else if (action.action === "navigate" && action.url) {
        await page.goto(action.url, { waitUntil: "domcontentloaded" }).catch(() => {});
        history.push({ action: `navigate ${action.url}` });
      }
    } catch (e) {
      history.push({ action: action.action, note: "ERROR: " + String(e && e.message ? e.message : e).slice(0, 100) });
    }
  }
  return { outcome, history };
}

async function launchChrome() {
  const profileDir = path.join(os.homedir(), ".ambitt-remote-hands", "profile");
  console.log(`Launching real Chrome (persistent profile: ${profileDir}) …`);
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

async function cliMode(goal, startUrl) {
  const { ctx, page } = await launchChrome();
  console.log(`Goal: ${goal}\nNavigating to ${startUrl} …\n`);
  await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1500);
  const { outcome } = await runA11yLoop(page, goal, {});
  console.log(`\nRESULT: ${outcome.ok ? "✅" : "❌"} ${outcome.text}`);
  await sleep(3000);
  await ctx.close();
  process.exit(0);
}

async function queueMode() {
  if (!DEVICE_TOKEN) { console.error("Set AMBITT_DEVICE_TOKEN to run in queue mode."); process.exit(1); }
  console.log(`Remote Hands worker online. Polling ${ORACLE_URL} …`);
  const { page } = await launchChrome();
  for (;;) {
    let task = null;
    try {
      const { ok, body } = await api("/extension/poll");
      task = ok && body.task ? body.task : null;
    } catch (e) {}
    if (!task) { await sleep(5000); continue; }

    console.log(`\n▶ Task ${task.id}: ${task.goal}`);
    // Self-approve the run — a dedicated worker; the meaningful approval is the
    // outreach batch downstream, not starting the browse.
    if (task.status !== "approved") await api(`/extension/tasks/${task.id}/allow`, { method: "POST", body: { allowed: true } });

    const startUrl = task.startingUrl || "about:blank";
    if (startUrl !== "about:blank") { await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(1500); }

    const { outcome, history } = await runA11yLoop(page, task.goal, { taskId: task.id, tool: process.env.RH_LOGIN_TOOL || "CoStar" });
    await api(`/extension/tasks/${task.id}/result`, {
      method: "POST",
      body: outcome.ok ? { status: "succeeded", result: outcome.text, transcript: history } : { status: "failed", error: outcome.text, transcript: history },
    });
    console.log(`  → ${outcome.ok ? "✅" : "❌"} ${outcome.text}`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--queue") return queueMode();
  if (!arg) {
    console.error('Usage: tsx remote-hands/worker.ts "<goal>" [url]   OR   tsx remote-hands/worker.ts --queue');
    process.exit(1);
  }
  return cliMode(arg, process.argv[3] || "https://example.com");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
