import puppeteer from "puppeteer";
import path from "node:path";

/* ---------------------------------------------------------------------------
   Capture the SMS consent card for carrier verification evidence.

   This exists because the first toll-free submission was rejected — code 1407,
   "Opt-In Checkbox is Pre-selected". Our checkbox is not pre-selected and never
   has been; the SCREENSHOT was taken mid-test, after a number had been typed
   and the box ticked. A reviewer looking at a ticked box in a page captioned
   "this is our consent screen" reached the only conclusion available to them.

   So the evidence is no longer a hand-taken screenshot. It is generated from
   the running portal, in its default state, by this script. Re-run it whenever
   the consent card changes, and the published evidence cannot drift away from
   the product again.

   Usage, with the portal dev server already running as a client:
     npx tsx scripts/capture-optin-screenshot.ts
   --------------------------------------------------------------------------- */

const PORTAL = process.env.PORTAL_URL ?? "http://localhost:3002";

/**
 * Two paths, same image, on purpose.
 *
 * The rejected submission pointed at sms-opt-in-screen.png. Resubmitting with
 * that same URL risks a reviewer being served a cached copy of the very
 * screenshot that got us rejected, which would burn the one resubmission
 * window we have. The new filename guarantees a cold fetch.
 *
 * The old path is overwritten rather than deleted: it is cited in a filing
 * already sitting in Twilio's queue, so it must neither 404 nor keep showing a
 * ticked box.
 */
const OUT_PATHS = [
  "website/public/compliance/sms-opt-in-consent-unchecked.png",
  "website/public/compliance/sms-opt-in-screen.png",
].map((p) => path.resolve(process.cwd(), p));

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // 2x for a crisp capture — a reviewer zooms in on the checkbox, and that is
    // the single pixel-level detail the whole submission now turns on.
    await page.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 2 });
    await page.goto(`${PORTAL}/agent/email`, { waitUntil: "networkidle0", timeout: 60_000 });

    // The consent card, found by its heading rather than by a brittle
    // nth-child. Matched case-insensitively: the eyebrow is uppercased by CSS
    // (text-transform), so the DOM still holds it in sentence case, and an
    // exact match on the rendered spelling silently finds nothing.
    const card = await page.evaluateHandle(() => {
      const label = [...document.querySelectorAll("*")].find(
        (e) =>
          e.children.length === 0 &&
          e.textContent?.trim().toLowerCase() === "where login codes go"
      );
      return label?.closest("section, .card, .panel") ?? label?.parentElement ?? null;
    });
    const element = card.asElement();
    if (!element) throw new Error("Could not find the consent card on /agent/email");

    // Refuse to publish evidence that shows the very thing we were rejected for.
    const state = await page.evaluate(() => {
      const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const phone = document.querySelector<HTMLInputElement>('input[type="tel"], input[name*="phone" i], input[id*="mobile" i]');
      return { checked: box?.checked ?? null, phone: phone?.value ?? "" };
    });
    if (state.checked !== false) {
      throw new Error(
        `The consent checkbox reads "${state.checked}" and must be false for this evidence. Nothing was written.`
      );
    }
    if (state.phone.trim() !== "") {
      throw new Error(
        `The mobile field is pre-filled ("${state.phone}"), which reads as pre-collected. Nothing was written.`
      );
    }

    const handle = element as import("puppeteer").ElementHandle<Element>;
    for (const out of OUT_PATHS) {
      await handle.screenshot({ path: out });
      console.log(`  captured  ${out}`);
    }
    console.log(`  checkbox  unchecked (verified before writing)`);
    console.log(`  mobile    empty (verified before writing)`);
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
