import puppeteer from "puppeteer";
const OUT = "/private/tmp/claude-501/-Users-kylekufuor-Projects-Ambitt-Agents/bc9c4a70-3937-4ea5-92ce-13af1c548fc3/scratchpad/ops";
async function main() {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 180_000 });
  try {
    for (const name of ["a-single", "b-digest", "b-healthy"]) {
      const page = await b.newPage();
      await page.setViewport({ width: 700, height: 1000, deviceScaleFactor: 1 });
      await page.goto(`file://${OUT}/${name}.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ width: 700, height: Math.min(h + 20, 2200), deviceScaleFactor: 1 });
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`  ${name}.png  (${h}px tall)`);
      await page.close();
    }
  } finally { await b.close(); }
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
