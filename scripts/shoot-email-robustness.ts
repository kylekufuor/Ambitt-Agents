// ---------------------------------------------------------------------------
// Email robustness shots
// ---------------------------------------------------------------------------
// The three conditions email design actually fails in, checked deliberately:
//
//   images-off  most clients block images by default, so the avatar has to
//               degrade to its teal-disc fallback and nothing may be lost
//   dark        Apple Mail and iOS invert aggressively
//   narrow      most of these are read on a phone
//
//   npx tsx scripts/shoot-email-robustness.ts docs/email-review/after
//
// A second argument overrides which renders to check, so the same harness
// covers the pre-sale funnel:
//
//   npx tsx scripts/shoot-email-robustness.ts docs/email-review/funnel-after \
//     proposal-doc,quote-doc,email-thanks
// ---------------------------------------------------------------------------

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const dir = resolve(process.cwd(), process.argv[2] ?? "docs/email-review/after");
const out = resolve(dir, "shots");
mkdirSync(out, { recursive: true });

const TARGETS = (process.argv[3] ?? "agent-response,welcome,action-required,digest")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });

  for (const name of TARGETS) {
    const url = `file://${resolve(dir, `${name}.html`)}`;

    // 1. Images blocked, desktop width.
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (r) =>
        r.resourceType() === "image" ? r.abort() : r.continue()
      );
      await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
      await page.goto(url, { waitUntil: "load" });
      // Aborted image requests settle after load; give layout a beat so the
      // alt-text fallback is measured before the capture.
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({
        path: resolve(out, `${name}-noimages.png`) as `${string}.png`,
        fullPage: true,
      });
      await page.close();
    }

    // 2. Dark mode, desktop width.
    {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: "dark" },
      ]);
      await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
      await page.goto(url, { waitUntil: "networkidle0" });
      await page.screenshot({
        path: resolve(out, `${name}-dark.png`) as `${string}.png`,
        fullPage: true,
      });
      await page.close();
    }

    console.log(`checked ${name}`);
  }

  await browser.close();
  console.log(`Robustness shots in ${out}`);
}

main();
