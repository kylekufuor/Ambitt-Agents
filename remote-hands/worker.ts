// @ts-nocheck
import { chromium } from "playwright";
import path from "path";
import os from "os";
import { decideA11yAction } from "../shared/runtime/browser-brain-a11y.js";

// ---------------------------------------------------------------------------
// Arthur Remote Hands — worker (Phase A standalone runner)
// ---------------------------------------------------------------------------
// Launches the REAL Google Chrome with a persistent profile (so a logged-in
// session survives across runs — the client logs into their SaaS once), then
// drives it a11y-first: distill the page into interactive elements + text,
// ask Arthur's brain for the next action, execute it with Playwright, repeat.
//
// Phase A: goal + starting URL come from the CLI, to prove the loop on a real
// local Chrome. Phase B wires this to the LocalTask queue + 2FA relay; Phase C
// runs it always-on on a Mac mini holding the client's warm session.
//
// Usage:
//   set -a && source .env && set +a
//   npx tsx remote-hands/worker.ts "<goal>" [startingUrl]
// ---------------------------------------------------------------------------

const MAX_STEPS = 30;

// Distilled page snapshot, run in the page as a RAW STRING (not a function
// reference) so tsx/esbuild can't inject a __name helper that breaks it in the
// browser. Tags each visible interactive element with data-rh="<ref>"
// (re-tagged every step so refs stay fresh) and returns the element list + text.
const DISTILL_SRC = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return !(s.visibility === "hidden" || s.display === "none" || +s.opacity === 0); };
  const nm = (el) => (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("alt") || (el.innerText || el.value || "").replace(/\\s+/g, " ").trim()).slice(0, 120);
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=option], [role=combobox], [contenteditable=true], [onclick], [tabindex]:not([tabindex="-1"])';
  document.querySelectorAll("[data-rh]").forEach((e) => e.removeAttribute("data-rh"));
  const els = []; let ref = 0;
  const collect = (root) => { let list; try { list = root.querySelectorAll("*"); } catch (e) { return; } list.forEach((el) => { if (el.matches && el.matches(sel) && vis(el)) { el.setAttribute("data-rh", String(ref)); els.push({ ref: ref, tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", type: el.getAttribute("type") || "", name: nm(el) }); ref++; } if (el.shadowRoot) collect(el.shadowRoot); }); };
  collect(document);
  const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 8000);
  return { url: location.href, title: document.title, elements: els, text };
})()`;

async function main() {
  const goal = process.argv[2];
  const startUrl = process.argv[3] || "https://example.com";
  if (!goal) {
    console.error('Usage: tsx remote-hands/worker.ts "<goal>" [startingUrl]');
    process.exit(1);
  }

  const profileDir = path.join(os.homedir(), ".ambitt-remote-hands", "profile");
  console.log(`Launching real Chrome (persistent profile: ${profileDir}) …`);
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  console.log(`Goal: ${goal}`);
  console.log(`Navigating to ${startUrl} …\n`);
  await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);

  const history: Array<{ action: string; note?: string }> = [];
  let outcome = { ok: false, text: "No result." };

  for (let step = 0; step < MAX_STEPS; step++) {
    await page.waitForTimeout(800); // settle
    let snap;
    try {
      snap = await page.evaluate(DISTILL_SRC);
    } catch (e) {
      // navigation in-flight; wait and retry once
      await page.waitForTimeout(1200);
      snap = await page.evaluate(DISTILL_SRC).catch(() => ({ url: page.url(), title: "", elements: [], text: "" }));
    }
    if (step === 0) console.log(`(distilled ${snap.elements.length} interactive elements)`);

    const action = await decideA11yAction({
      goal, url: snap.url, title: snap.title, elements: snap.elements, text: snap.text, history, stepIndex: step,
    });

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
        const loc = page.locator(`[data-rh="${action.ref}"]`).first();
        await loc.click({ timeout: 8000 });
        await loc.fill(action.text || "");
        history.push({ action: `type "${String(action.text || "").slice(0, 40)}" #${action.ref}`, note: label });
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

  console.log(`\nRESULT: ${outcome.ok ? "✅" : "❌"} ${outcome.text}`);
  console.log("\n(Leaving Chrome open 4s so you can see the final state…)");
  await page.waitForTimeout(4000);
  await ctx.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
