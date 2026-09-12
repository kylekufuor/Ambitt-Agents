// Run (from the repo root):
//   node_modules/.bin/tsx --tsconfig website/tsconfig.json "website/app/(editorial)/editorial.test.ts"
// (--tsconfig picks up the website's automatic JSX runtime; the root config has none.)
//
// Renders the two marketing pages (`/`, `/use-cases`) to static HTML with React
// and checks what a visitor would actually get: links that go nowhere, icons
// that point at a symbol no sprite carries, pricing previews without availability labels, copy glued together by a whitespace bug, and anything that
// should never reach a public page.
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
  const { IconSprite } = await import("./_components/icons");
  const pricing = await import("./_components/home/pricing");
  const { PLAN_PREVIEW } = await import("../lib/plan-preview");
  const { QA } = await import("./_components/home/faq");

  const sprites = renderToStaticMarkup(createElement(Sprites)) + renderToStaticMarkup(createElement(IconSprite));
  const render = (page: () => ReactElement): string => sprites + renderToStaticMarkup(createElement(page));
  const docs = await import("./docs/page");
  const contact = await import("./contact/page");
  const privacy = await import("./privacy/page");
  const terms = await import("./terms/page");
  const sms = await import("./sms-opt-in/page");
  const pages = { "/": render(home.default), "/use-cases": render(cases.default), "/docs": render(docs.default), "/contact": render(contact.default), "/privacy": render(privacy.default), "/terms": render(terms.default), "/sms-opt-in": render(sms.default) } as const;
  type PagePath = keyof typeof pages;

  // --- metadata ---------------------------------------------------------------
  check("homepage title", home.metadata.title, "Ambitt Agents: you hired someone, not a seat");
  check("use-cases title", cases.metadata.title, "Ambitt Agents: four workflows inside the portal");
  check("homepage canonical", home.metadata.alternates?.canonical, "/");
  check("use-cases canonical", cases.metadata.alternates?.canonical, "/use-cases");
  check("share image survives the page-level openGraph", JSON.stringify(cases.metadata.openGraph).includes("ambitt-agent-avatar.png"), true);

  const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const ids = Object.fromEntries(Object.entries(pages).map(([path, html]) => [path, new Set(idsOf(html))])) as Record<PagePath, Set<string>>;

  // Everything a visitor can follow off these pages. Anything else is a typo.
  const EXTERNAL = new Set(["https://portal.ambitt.agency", "mailto:hello@ambitt.agency", "mailto:support@ambitt.agency"]);
  const SITE_ROUTES = new Set(["/docs", "/contact", "/privacy", "/terms", "/sms-opt-in"]);

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
      } else if (href.startsWith("/docs#")) {
        if (!ids["/docs"].has(href.split("#")[1])) bad.push(href);
      } else if (!SITE_ROUTES.has(href) && !EXTERNAL.has(href)) {
        bad.push(href);
      }
    }
    check(`${path}: every link resolves`, bad, []);
    for (const route of ["/docs", "/contact", "/privacy", "/terms"]) check(`${path}: footer links ${route}`, hrefs.includes(route), true);

    // The sprites are pruned to what the pages use. A new icon must bring its symbol.
    const refs = [...html.matchAll(/<use\s[^>]*?href="#([^"]+)"/g)].map((m) => m[1]);
    check(`${path}: every icon has its symbol`, [...new Set(refs.filter((r) => !ids[path].has(r)))], []);

    // Every primary "Talk to us" lands on the contact section.
    const ctas = [...html.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/g)]
      .filter((m) => /class="[^"]*\bbtn-primary\b/.test(m[1]) && text(m[2]).startsWith("Talk to us"))
      .map((m) => m[1].match(/href="([^"]*)"/)?.[1]);
    check(`${path}: has a primary Talk to us`, ctas.length > 0, true);
    check(`${path}: primary CTA goes to the contact section`, [...new Set(ctas)], [path === "/" ? "#contact" : "/#contact"]);

    const copy = text(html.replace(sprites, ""));
    if (!["/privacy", "/terms", "/sms-opt-in"].includes(path)) check(`${path}: no em dashes in visible copy`, copy.includes("—"), false);
    // A dropped space glues a figure to the next word ("$5,000on"). Next's
    // compiler does exactly that to a multi-line JSX text run that contains an
    // entity, which is why the copy uses literal ' and & (see the source check
    // below). React marks each seam between a value and literal text with
    // <!-- -->, so a letter on both sides of one is a space that went missing.
    check(`${path}: no figure glued to a word`, copy.match(/\$[\d,]+(?![km]\b)[a-z]/g) ?? [], []);
    check(`${path}: no word glued across a value`, html.match(/.{0,24}[A-Za-z0-9]<!-- -->[A-Za-z].{0,24}/g) ?? [], []);
    check(`${path}: operator not named`, /\bkyle\b/i.test(html), false);
    // The word splitter must not eat spaces: two words never touch in the copy.
    check(`${path}: headline words keep their spaces`, copy.includes("hiredsomeone") || copy.includes("Nota seat"), false);
  }
  check("homepage has the sections the nav targets", ["how", "pricing", "faq", "contact"].every((a) => ids["/"].has(a)), true);
  check("use-cases has an anchor per case", ["bookkeeping", "commercial-real-estate", "home-services", "tax-and-accounting"].every((a) => ids["/use-cases"].has(a)), true);
  check("every FAQ question is on the page", QA.every((q) => pages["/"].includes(q.q)), true);

  // The source side of the same bug: no HTML entities in the marketing JSX.
  // `&nbsp;` in the wordmark is the one exception; it never starts a text run.
  const sources = readdirSync(here, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx") && (f.startsWith("_components/") || f === "page.tsx" || f === "use-cases/page.tsx"));
  const entities = sources.flatMap((f) =>
    [...readFileSync(join(here, f), "utf8").matchAll(/&(?!nbsp;)[a-zA-Z#0-9]+;/g)].map((m) => `${f}: ${m[0]}`),
  );
  check("no HTML entities in marketing JSX", entities, []);

  check("cases shows all four native video players", (pages["/use-cases"].match(/<video /g) ?? []).length, 4);
  check("cases labels fictional data", text(pages["/use-cases"]).includes("All businesses, records and results in these demos are fictional"), true);
  check("cases no longer claims unbuilt browser workspace", /browser Arthur is actually driving|mid-search|firstrun/.test(pages["/use-cases"]), false);
  check("contact has no unverified booking or instant setup offer", /calendly.com|Under 60 seconds|10\+ hours/.test(pages["/contact"]), false);
  check("help distinguishes upcoming billing", text(pages["/docs"]).includes("have not replaced existing account billing"), true);
  check("help links to working lead correction method", text(pages["/docs"]).includes("Reply to your agent with the lead name"), true);

  // Public plans are explicitly a preview until usage billing is built.
  // Assert the agreed prices independently of their render source.
  const agreed = {
    free: [0, 30, 2, 3, 1], pro: [7900, 80, 8, 6, 1],
    max: [19900, 200, 20, null, 1], business: [59900, 600, 60, null, 3],
  } as const;
  const section = /<section class="section ruled" id="pricing">([\s\S]*?)<\/section>/.exec(pages["/"])?.[1] ?? "";
  check("pricing section found", section.length > 0, true);
  for (const key of Object.keys(agreed) as Array<keyof typeof agreed>) {
    const plan = PLAN_PREVIEW[key];
    check(`${key}: agrees with Kyle's pricing decisions`, [plan.monthlyCents, plan.credits, plan.watchHours, plan.tools, plan.agents], agreed[key]);
    const card = new RegExp(`<article[^>]*data-tier="${key}"[^>]*>[\\s\\S]*?</article>`).exec(section)?.[0] ?? "";
    check(`${key}: card found`, card.length > 0, true);
    check(`${key}: monthly price rendered`, text(card).includes(`${pricing.usd(plan.monthlyCents)}/month`), true);
    check(`${key}: allowance is credits, not a guaranteed run count`, text(card).includes(`${plan.credits} credits a month`), true);
    check(`${key}: planned watching allowance rendered`, text(card).includes(`${plan.watchHours} hours of browser watching`), true);
    check(`${key}: tool allowance rendered`, text(card).includes(plan.tools === null ? "Unlimited tool connections" : `${plan.tools} tool connections`), true);
    check(`${key}: availability disclosed on the card`, text(card).includes("coming soon"), true);
    check(`${key}: CTA does not promise working signup`, text(card).includes("Ask about early access") && card.includes('href="#contact"'), true);
  }
  for (const audience of ["individuals", "business"]) {
    check(`${audience}: tab linked to its panel`, section.includes(`id="pricing-tab-${audience}" aria-controls="pricing-${audience}"`), true);
    check(`${audience}: panel labelled by its tab`, section.includes(`role="tabpanel" aria-labelledby="pricing-tab-${audience}"`), true);
  }
  check("individuals is selected initially", section.includes('aria-controls="pricing-individuals" aria-selected="true"'), true);
  check("both panels remain readable without JavaScript", section.includes("<noscript>"), true);
  const copy = text(section);
  check("custom build price and retainer", copy.includes("From$5,000") && copy.includes("One-time build + a quoted monthly retainer"), true);
  check("top-up pack disclosed", copy.includes("40 extra credits for $25"), true);
  check("unfinished capabilities disclosed", copy.includes("Credit billing and browser watching are in development"), true);
  check("no retired public plans or annual offer", /Starter|Growth|Scale|\$499|\$1,499|\$3,499|2 months free|20% off|Yearly/.test(text(pages["/"])), false);
  check("no signup link to an unbuilt route", pages["/"].includes("/signup"), false);
  // The active billing policy stays consistent across Oracle and the portal.
  const constantsPath = join(websiteRoot, "..", "shared", "pricing-constants.ts");
  const active = await import(pathToFileURL(constantsPath).href);
  const portal = await import(pathToFileURL(join(websiteRoot, "..", "client-portal", "src", "lib", "pricing-constants.ts")).href);
  check("active billing tiers remain in sync", active.TIERS, portal.TIERS);
  check("active billing discounts remain in sync", active.SECOND_AGENT_DISCOUNT_PCT, portal.SECOND_AGENT_DISCOUNT_PCT);
  check("walkthrough asset exists", existsSync(join(websiteRoot, "public/demos/portal-walkthrough-narrated.mp4")), true);
  check("retired pricing screenshot removed from page", pages["/"].includes("portal-billing.webp"), false);
  check("usd formats prices", [pricing.usd(0), pricing.usd(7900), pricing.usd(500000)], ["$0", "$79", "$5,000"]);

}

main()
  .catch((err: unknown) => {
    failures.push(`threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  })
  .finally(() => {
    console.log(`\nmarketing pages: ${passed}/${passed + failures.length} passed`);
    if (failures.length) {
      for (const f of failures) console.error(`  FAIL ${f}`);
      process.exitCode = 1;
    }
  });
