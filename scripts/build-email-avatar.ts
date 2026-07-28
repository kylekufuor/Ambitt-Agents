// ---------------------------------------------------------------------------
// Rasterize the email agent avatar
// ---------------------------------------------------------------------------
// Email clients strip inline SVG, so the avatar ships as a PNG. This renders
// client-portal/public/brand/ambitt-agent-avatar.svg at 2x the largest size we
// use it (44px -> 176px) and writes the PNG next to it.
//
//   npx tsx scripts/build-email-avatar.ts
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const brand = resolve(process.cwd(), "client-portal/public/brand");
const svg = readFileSync(resolve(brand, "ambitt-agent-avatar.svg"), "utf8");
const SIZE = 176;

async function main() {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace(
      /width="256" height="256"/,
      `width="${SIZE}" height="${SIZE}"`
    )}</body></html>`
  );
  const buf = await page.screenshot({ omitBackground: true, type: "png" });
  writeFileSync(resolve(brand, "ambitt-agent-avatar.png"), buf);
  await browser.close();
  console.log(`Wrote ambitt-agent-avatar.png at ${SIZE}x${SIZE} (${(buf.length / 1024).toFixed(1)} KB)`);
}

main();
