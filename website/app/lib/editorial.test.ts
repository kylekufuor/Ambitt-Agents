// Run (from the repo root): node_modules/.bin/tsx website/app/lib/editorial.test.ts
// Unit test for the editorial page wrapper, plus checks on the two design files
// it serves: links that go nowhere, and prices that disagree with Oracle.
//
// The design files are edited by hand. Nothing else notices a link still
// pointing at a mockup filename, an anchor whose section was renamed, or a
// ledger that drifted from shared/pricing-constants.ts, so this does.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SITE_URL, editorialResponse, escapeHtml, renderEditorialDocument, splitFragment } from "./editorial.js";

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// process.argv[1] is this file, however it was invoked (CJS or ESM, any cwd).
const websiteRoot = resolve(dirname(resolve(process.argv[1])), "../..");

interface Tier {
  monthlyCents: number;
  setupFeeCentsMin: number;
  setupFeeCentsMax: number;
}

async function main(): Promise<void> {
  // --- splitFragment ---------------------------------------------------------
  const script = '<script>\n(function(){ "use strict"; var a = 1 < 2 && "</div>"; })();\n</script>';
  const frag = `<title>Ambitt &amp; Co: a test</title>\n<style>\n.a{color:red}\n</style>\n<header>hi</header>\n${script}\n`;
  const parts = splitFragment(frag);
  check("title is extracted and entities decoded", parts.title, "Ambitt & Co: a test");
  check("style element kept whole", parts.style, "<style>\n.a{color:red}\n</style>");
  check("body drops title and style, keeps the rest in order", parts.body, `<header>hi</header>\n${script}`);

  const styleFirst = splitFragment("<style>x{}</style><title>T</title><p>b</p>");
  check("style before title also splits", [styleFirst.title, styleFirst.style, styleFirst.body], ["T", "<style>x{}</style>", "<p>b</p>"]);

  check("missing title throws", throws(() => splitFragment("<style>x{}</style><p>b</p>")), true);
  check("empty title throws", throws(() => splitFragment("<title>  </title><style>x{}</style>")), true);
  check("missing style throws", throws(() => splitFragment("<title>T</title><p>b</p>")), true);

  check("escapeHtml covers text and attribute contexts", escapeHtml(`a & "b" <c>`), "a &amp; &quot;b&quot; &lt;c&gt;");

  // --- renderEditorialDocument ----------------------------------------------
  const doc = renderEditorialDocument(frag, { path: "/use-cases", description: 'Say "hello" & mean it' });
  const head = doc.slice(doc.indexOf("<head>"), doc.indexOf("</head>"));
  const body = doc.slice(doc.indexOf("<body>"), doc.indexOf("</body>"));
  check("starts with the doctype", doc.startsWith("<!doctype html>\n"), true);
  check("html lang is en", doc.includes('<html lang="en">'), true);
  check("charset is declared in the first 1024 bytes", doc.indexOf('<meta charset="utf-8">') > 0 && doc.indexOf('<meta charset="utf-8">') < 1024, true);
  check("charset comes before the title", doc.indexOf("<meta charset") < doc.indexOf("<title>"), true);
  check("viewport meta present", head.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), true);
  check("exactly one title", doc.split("<title>").length - 1, 1);
  check("title re-escaped once, not twice", head.includes("<title>Ambitt &amp; Co: a test</title>"), true);
  check("style moved into head", head.includes("<style>\n.a{color:red}\n</style>"), true);
  check("style not left in body", body.includes("<style>"), false);
  check("markup lands in body", body.includes("<header>hi</header>"), true);
  check("motion script survives byte for byte", body.includes(script), true);
  check("canonical is absolute", head.includes(`<link rel="canonical" href="${SITE_URL}/use-cases">`), true);
  check("og:url matches canonical", head.includes(`<meta property="og:url" content="${SITE_URL}/use-cases">`), true);
  check("description is attribute-escaped", head.includes('content="Say &quot;hello&quot; &amp; mean it"'), true);
  check("og:title mirrors the title", head.includes('<meta property="og:title" content="Ambitt &amp; Co: a test">'), true);
  check("twitter card declared", head.includes('<meta name="twitter:card" content="summary">'), true);
  check("svg favicon linked", head.includes('href="/brand/ambitt-agents-favicon.svg"'), true);
  check("root canonical has a trailing slash", renderEditorialDocument(frag, { path: "/", description: "d" }).includes(`href="${SITE_URL}/"`), true);

  const res = editorialResponse(frag, { path: "/", description: "d" });
  check("response is text/html utf-8", res.headers.get("content-type"), "text/html; charset=utf-8");
  check("response body is the rendered document", await res.text(), renderEditorialDocument(frag, { path: "/", description: "d" }));

  // --- The real design files ------------------------------------------------
  const pages = {
    "/": readFileSync(join(websiteRoot, "editorial/home.html"), "utf8"),
    "/use-cases": readFileSync(join(websiteRoot, "editorial/use-cases.html"), "utf8"),
  } as const;
  type PagePath = keyof typeof pages;

  check("homepage title", splitFragment(pages["/"]).title, "Ambitt Agents: you hired someone, not a seat");
  check("use-cases title", splitFragment(pages["/use-cases"]).title, "Ambitt Agents: the cases, four industries, one workforce");

  const idsOf = (html: string): Set<string> => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const ids: Record<PagePath, Set<string>> = { "/": idsOf(pages["/"]), "/use-cases": idsOf(pages["/use-cases"]) };

  // Everything a visitor can follow off these pages. Anything else is a typo
  // or a leftover from the mockup.
  const EXTERNAL = new Set(["https://portal.ambitt.agency", "mailto:hello@ambitt.agency"]);
  const SITE_ROUTES = new Set(["/docs", "/contact", "/privacy", "/terms"]);

  for (const [path, html] of Object.entries(pages) as [PagePath, string][]) {
    // Any .html href would also fail the allow-list below; this catches the
    // mockup's own filenames anywhere, comments included.
    check(`${path}: no mockup filenames`, html.includes("v2-editorial"), false);

    // Comments quote example markup (the icon sprite's notes mention
    // `<use href="#i-...">`); those are prose, not links.
    const markup = html.replace(/<!--[\s\S]*?-->/g, "");
    const hrefs = [...markup.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
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
    check(`${path}: every href resolves`, bad, []);

    for (const route of SITE_ROUTES) check(`${path}: footer links ${route}`, hrefs.includes(route), true);

    const ctas = [...html.matchAll(/<a href="([^"]*)" class="btn btn-primary">Talk to us<\/a>/g)].map((m) => m[1]);
    check(`${path}: primary CTA goes to the contact section`, [...new Set(ctas)], [path === "/" ? "#contact" : "/#contact"]);

    const visible = html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      .replace(/<script>[\s\S]*?<\/script>/g, "");
    check(`${path}: no em dashes in visible copy`, visible.includes("—"), false);

    const rendered = renderEditorialDocument(html, { path, description: "d" });
    const motion = /<script>[\s\S]*?<\/script>/.exec(html)?.[0] ?? "";
    check(`${path}: motion script present and intact`, motion.includes("IntersectionObserver") && rendered.includes(motion), true);
  }
  check("homepage has the contact section the CTA targets", ids["/"].has("contact"), true);

  // --- Pricing agrees with shared/pricing-constants.ts ------------------------
  // Loaded by computed path at run time, never a static import: the website is
  // built on Railway from website/ alone, where ../shared does not exist, and a
  // static import would fail that build's type check.
  const constantsPath = join(websiteRoot, "..", "shared", "pricing-constants.ts");
  check("shared/pricing-constants.ts is reachable", existsSync(constantsPath), true);
  const { TIERS } = (await import(pathToFileURL(constantsPath).href)) as { TIERS: Record<string, Tier> };

  const usd = (cents: number): string => {
    if (cents % 100 !== 0) throw new Error(`ledger shows whole dollars; got ${cents} cents`);
    return "$" + String(cents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const text = (s: string): string => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  const pricing = /<section class="section" id="pricing">([\s\S]*?)<\/section>/.exec(pages["/"])?.[1] ?? "";
  check("pricing section found", pricing.length > 0, true);
  check("ledger header shows monthly and the one-time build", /<th>Monthly<\/th><th>One-time build<\/th>/.test(pricing), true);

  for (const [key, label] of [["starter", "Starter"], ["growth", "Growth"], ["scale", "Scale"]] as const) {
    const tier = TIERS[key];
    const row = new RegExp(`<tr>\\s*<td><div class="tier">${label}</div>[\\s\\S]*?</tr>`).exec(pricing)?.[0] ?? "";
    const cells = [...row.matchAll(/<td class="price"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const build =
      tier.setupFeeCentsMin === tier.setupFeeCentsMax
        ? `${usd(tier.setupFeeCentsMin)} flat`
        : `${usd(tier.setupFeeCentsMin)} to ${usd(tier.setupFeeCentsMax)}`;
    check(`${label} ledger row`, cells, [`${usd(tier.monthlyCents)}/mo`, build, `${usd(tier.monthlyCents * 12)}/yr`]);
    // The ledger foot claims every tier's first year, build included, is under
    // a $55,000 coordinator. Keep that true or change the sentence.
    check(`${label} first year with build stays under $55,000`, tier.monthlyCents * 12 + tier.setupFeeCentsMax < 5_500_000, true);
  }

  const foot = text(pricing);
  check("Growth and Scale share one flat build", TIERS.growth.setupFeeCentsMin === TIERS.scale.setupFeeCentsMin && TIERS.growth.setupFeeCentsMin === TIERS.growth.setupFeeCentsMax && TIERS.scale.setupFeeCentsMin === TIERS.scale.setupFeeCentsMax, true);
  check("ledger foot states the flat build", foot.includes(`It's a flat ${usd(TIERS.growth.setupFeeCentsMin)} on Growth and Scale.`), true);
  check("ledger foot states Starter's range", foot.includes(`On Starter it's ${usd(TIERS.starter.setupFeeCentsMin)} to ${usd(TIERS.starter.setupFeeCentsMax)}`), true);
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
