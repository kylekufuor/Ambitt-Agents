// Run (from the repo root):
//   node_modules/.bin/tsx --tsconfig website/tsconfig.json "website/app/(editorial)/editorial.test.ts"
// (--tsconfig picks up the website's automatic JSX runtime; the root config has none.)
//
// Renders the two editorial pages (`/`, `/use-cases`) to static HTML with React
// and checks what a visitor would actually get: links that go nowhere, icons
// that point at a symbol the sprite no longer carries, prices that disagree
// with what Oracle bills, copy glued together by a whitespace bug, and
// anything that should never reach a public page.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Next turns `import x from "./photo.webp"` into { src, width, height }; plain
// Node cannot import an image at all. Stand in for the bundler here. (tsx runs
// this package as CommonJS, so the CommonJS extension table is the hook.)
for (const ext of [".webp", ".png", ".jpg", ".jpeg", ".avif"]) {
  require.extensions[ext] = (module, filename) => {
    module.exports = { __esModule: true, default: { src: `/_next/static/media/${basename(filename)}`, width: 1, height: 1 } };
  };
}

let passed = 0;
const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

// process.argv[1] is this file, however it was invoked.
const here = dirname(resolve(process.argv[1]));
const websiteRoot = resolve(here, "../..");

interface Tier {
  monthlyCents: number;
  setupFeeCentsMin: number;
  setupFeeCentsMax: number;
}

/**
 * Visible text, near enough: entities back, whitespace collapsed, and a block
 * boundary counted as a break while an inline tag is not, so a space that is
 * genuinely missing between two words still shows up as glued text.
 */
const INLINE = /^<\/?(a|b|em|strong|span|i|cite|time|small|code|sup|sub|abbr|mark|label|button)\b/;
const text = (html: string): string =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, (tag) => (INLINE.test(tag) ? "" : " "))
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function main(): Promise<void> {
  const home = await import("./page");
  const cases = await import("./use-cases/page");
  const { Sprites } = await import("./_components/sprites");
  const pricing = await import("./_components/home/pricing");

  const sprites = renderToStaticMarkup(createElement(Sprites));
  const render = (page: () => ReactElement): string => sprites + renderToStaticMarkup(createElement(page));
  const pages = { "/": render(home.default), "/use-cases": render(cases.default) } as const;
  type PagePath = keyof typeof pages;

  // --- metadata ---------------------------------------------------------------
  check("homepage title", home.metadata.title, "Ambitt Agents: you hired someone, not a seat");
  check("use-cases title", cases.metadata.title, "Ambitt Agents: the cases, four industries, one workforce");
  check("homepage canonical", home.metadata.alternates?.canonical, "/");
  check("use-cases canonical", cases.metadata.alternates?.canonical, "/use-cases");
  check("share image survives the page-level openGraph", JSON.stringify(cases.metadata.openGraph).includes("ambitt-agent-avatar.png"), true);

  const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const ids = { "/": new Set(idsOf(pages["/"])), "/use-cases": new Set(idsOf(pages["/use-cases"])) };

  // Everything a visitor can follow off these pages. Anything else is a typo.
  const EXTERNAL = new Set(["https://portal.ambitt.agency", "mailto:hello@ambitt.agency"]);
  const SITE_ROUTES = new Set(["/docs", "/contact", "/privacy", "/terms"]);

  for (const [path, html] of Object.entries(pages) as [PagePath, string][]) {
    // A duplicated id makes a gradient or anchor resolve to the wrong element.
    const all = idsOf(html);
    check(`${path}: every id is unique`, all.filter((id, i) => all.indexOf(id) !== i), []);

    // <a href>, not <use href>: symbol references are checked separately below.
    const hrefs = [...html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)].map((m) => m[1]);
    const bad: string[] = [];
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        if (!ids[path].has(href.slice(1))) bad.push(href);
      } else if (href === "/" || href === "/use-cases" || href.startsWith("/#") || href.startsWith("/use-cases#")) {
        const [route, anchor] = href.split("#") as [string, string | undefined];
        const target = (route === "/use-cases" ? "/use-cases" : "/") as PagePath;
        if (anchor !== undefined && !ids[target].has(anchor)) bad.push(href);
      } else if (!SITE_ROUTES.has(href) && !EXTERNAL.has(href)) {
        bad.push(href);
      }
    }
    check(`${path}: every link resolves`, bad, []);
    for (const route of SITE_ROUTES) check(`${path}: footer links ${route}`, hrefs.includes(route), true);

    // The sprites are pruned to what the pages use. A new icon must bring its symbol.
    const refs = [...html.matchAll(/<use\s[^>]*?href="#([^"]+)"/g)].map((m) => m[1]);
    check(`${path}: every icon has its symbol`, [...new Set(refs.filter((r) => !ids[path].has(r)))], []);

    const ctas = [...html.matchAll(/<a href="([^"]*)" class="btn btn-primary">Talk to us<\/a>/g)].map((m) => m[1]);
    check(`${path}: primary CTA goes to the contact section`, [...new Set(ctas)], [path === "/" ? "#contact" : "/#contact"]);

    const copy = text(html.replace(sprites, ""));
    check(`${path}: no em dashes in visible copy`, copy.includes("—"), false);
    // A dropped space glues a figure to the next word ("$5,000on"). Next's
    // compiler does exactly that to a multi-line JSX text run that contains an
    // entity, which is why the copy uses literal ' and & (see the source check
    // below). React marks each seam between a value and literal text with
    // <!-- -->, so a letter on both sides of one is a space that went missing.
    check(`${path}: no figure glued to a word`, copy.match(/\$[\d,]+(?![km]\b)[a-z]/g) ?? [], []);
    check(`${path}: no word glued across a value`, html.match(/.{0,24}[A-Za-z0-9]<!-- -->[A-Za-z].{0,24}/g) ?? [], []);
    check(`${path}: operator not named`, /\bkyle\b/i.test(html), false);
  }
  check("homepage has the contact section the CTA targets", ids["/"].has("contact"), true);

  // The source side of the same bug: no HTML entities in the editorial JSX.
  // `&nbsp;` in the wordmark is the one exception; it never starts a text run.
  const sources = readdirSync(here, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx"));
  const entities = sources.flatMap((f) =>
    [...readFileSync(join(here, f), "utf8").matchAll(/&(?!nbsp;)[a-zA-Z#0-9]+;/g)].map((m) => `${f}: ${m[0]}`),
  );
  check("no HTML entities in editorial JSX", entities, []);
  check("use-cases has an anchor per case", ["bookkeeping", "commercial-real-estate", "home-services", "tax-and-accounting"].every((a) => ids["/use-cases"].has(a)), true);

  // --- pricing agrees with shared/pricing-constants.ts --------------------------
  // Loaded by computed path at run time, never a static import: the website is
  // built on Railway from website/ alone, where ../shared does not exist.
  const constantsPath = join(websiteRoot, "..", "shared", "pricing-constants.ts");
  check("shared/pricing-constants.ts is reachable", existsSync(constantsPath), true);
  const shared = (await import(pathToFileURL(constantsPath).href)) as { TIERS: Record<string, Tier>; SECOND_AGENT_DISCOUNT_PCT: number };

  for (const key of ["starter", "growth", "scale"] as const) {
    const mine = pricing.TIERS[key];
    const theirs = shared.TIERS[key];
    check(`${key}: website mirror matches Oracle`, [mine.monthlyCents, mine.setupFeeCentsMin, mine.setupFeeCentsMax], [theirs.monthlyCents, theirs.setupFeeCentsMin, theirs.setupFeeCentsMax]);
    // The ledger foot claims every tier's first year, build included, is under a
    // $55,000 coordinator. Keep that true or change the sentence.
    check(`${key}: first year with build stays under the coordinator`, theirs.monthlyCents * 12 + theirs.setupFeeCentsMax < pricing.COORDINATOR_SALARY * 100, true);
  }
  check("discount mirror matches Oracle", pricing.SECOND_AGENT_DISCOUNT_PCT, shared.SECOND_AGENT_DISCOUNT_PCT);

  const section = /<section class="section" id="pricing">([\s\S]*?)<\/section>/.exec(pages["/"])?.[1] ?? "";
  check("pricing section found", section.length > 0, true);
  const usd = pricing.usd;
  for (const key of ["starter", "growth", "scale"] as const) {
    const tier = shared.TIERS[key];
    const label = pricing.TIERS[key].label;
    const row = new RegExp(`<tr><td><div class="tier">${label}</div>[\\s\\S]*?</tr>`).exec(section)?.[0] ?? "";
    const cells = [...row.matchAll(/<td class="price"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const build =
      tier.setupFeeCentsMin === tier.setupFeeCentsMax
        ? `${usd(tier.setupFeeCentsMin)} flat`
        : `${usd(tier.setupFeeCentsMin)} to ${usd(tier.setupFeeCentsMax)}`;
    check(`${label} ledger row`, cells, [`${usd(tier.monthlyCents)}/mo`, build, `${usd(tier.monthlyCents * 12)}/yr`]);
  }
  const foot = text(section);
  const { growth, scale, starter } = shared.TIERS;
  check("Growth and Scale share one flat build", growth.setupFeeCentsMin === scale.setupFeeCentsMin && growth.setupFeeCentsMin === growth.setupFeeCentsMax && scale.setupFeeCentsMin === scale.setupFeeCentsMax, true);
  check("ledger foot states the flat build", foot.includes(`It's a flat ${usd(growth.setupFeeCentsMin)} on Growth and Scale.`), true);
  check("ledger foot states Starter's range", foot.includes(`On Starter it's ${usd(starter.setupFeeCentsMin)} to ${usd(starter.setupFeeCentsMax)}, quoted`), true);
  // Billing is per agent: the first at plan price, each after that discounted.
  check("no false 'no per-seat charge' claim", /no per-seat charge/i.test(pages["/"]), false);
  check("states the additional-agent discount", foot.includes(`each one you add after that is ${shared.SECOND_AGENT_DISCOUNT_PCT}% off`), true);
  check("usd formats thousands", [usd(49_900), usd(500_000), usd(4_198_800)], ["$499", "$5,000", "$41,988"]);
}

main()
  .catch((err: unknown) => {
    failures.push(`threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  })
  .finally(() => {
    console.log(`\neditorial pages: ${passed}/${passed + failures.length} passed`);
    if (failures.length) {
      for (const f of failures) console.error(`  FAIL ${f}`);
      process.exitCode = 1;
    }
  });
