// ---------------------------------------------------------------------------
// Email screenshot harness
// ---------------------------------------------------------------------------
// Renders each preview HTML at a desktop reading-pane width and a phone width
// so design review happens against what the client actually sees.
//
//   npx tsx scripts/shoot-emails.ts docs/email-review/before
//
// Writes <dir>/shots/<name>-desktop.png and <name>-mobile.png.
// ---------------------------------------------------------------------------

import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const dir = resolve(process.cwd(), process.argv[2] ?? "docs/email-review/before");
const shots = resolve(dir, "shots");
mkdirSync(shots, { recursive: true });

const files = readdirSync(dir).filter((f) => f.endsWith(".html") && f !== "index.html");

async function main() {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });

  for (const file of files) {
    const name = file.replace(/\.html$/, "");
    for (const [variant, width] of [["desktop", 800], ["mobile", 390]] as const) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 1200, deviceScaleFactor: 2 });
      await page.goto(`file://${resolve(dir, file)}`, { waitUntil: "networkidle0" });
      await page.screenshot({
        path: resolve(shots, `${name}-${variant}.png`) as `${string}.png`,
        fullPage: true,
      });
      await page.close();
    }
    console.log(`shot ${name}`);
  }

  await browser.close();
  console.log(`Screenshots in ${shots}`);
}

main();
