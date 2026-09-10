/**
 * Editorial pages: the approved design, served as a complete document.
 *
 * `/` and `/use-cases` are not React. Each is the self-contained HTML fragment
 * Kyle signed off (editorial/*.html): one <title>, one <style>, the page
 * markup, and one inline <script> for the motion, with fonts and images
 * inlined as data URIs. A component rewrite would cost hours and fidelity for
 * nothing a visitor could see, so the route handlers read the fragment and
 * hand it here to be wrapped in a real document with a proper <head>.
 *
 * Pure string work. No fs, no Next imports, so editorial.test.ts can run it
 * without a build.
 */

export const SITE_URL = "https://www.ambitt.agency";

// Square brand mark, the only raster brand asset we have. It suits a
// `summary` card; a 1200x630 image would earn `summary_large_image`.
const SHARE_IMAGE = { path: "/brand/ambitt-agent-avatar.png", width: 512, height: 512 };

export interface EditorialMeta {
  /** Site-relative path this document is served at, e.g. "/use-cases". */
  path: string;
  description: string;
}

export interface EditorialFragment {
  /** Title text with entities decoded; escape again before emitting. */
  title: string;
  /** The whole <style>...</style> element, moved into <head> untouched. */
  style: string;
  /** Everything else, in order: sprites, markup, the motion <script>. */
  body: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name: string) => ENTITIES[name]);
}

/** Escape for both text and double-quoted attribute contexts. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Pull the <title> and the <style> block out of a design fragment. Throws
 * rather than guessing: a fragment missing either would ship an untitled or
 * unstyled homepage, and failing the build is the better outcome.
 */
export function splitFragment(html: string): EditorialFragment {
  const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!titleMatch) throw new Error("editorial fragment has no <title>");
  const title = decodeEntities(titleMatch[1].trim());
  if (!title) throw new Error("editorial fragment has an empty <title>");

  const styleMatch = /<style>[\s\S]*?<\/style>/i.exec(html);
  if (!styleMatch) throw new Error("editorial fragment has no <style> block");

  // Remove the later match first so the earlier match's index stays valid.
  const cuts = [
    { at: titleMatch.index, len: titleMatch[0].length },
    { at: styleMatch.index, len: styleMatch[0].length },
  ].sort((a, b) => b.at - a.at);
  let body = html;
  for (const c of cuts) body = body.slice(0, c.at) + body.slice(c.at + c.len);

  return { title, style: styleMatch[0], body: body.trim() };
}

export function renderEditorialDocument(fragment: string, meta: EditorialMeta): string {
  const { title, style, body } = splitFragment(fragment);
  const url = SITE_URL + meta.path;
  const image = SITE_URL + SHARE_IMAGE.path;
  const t = escapeHtml(title);
  const d = escapeHtml(meta.description);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" href="/brand/ambitt-agents-favicon.svg" type="image/svg+xml">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Ambitt Agents">',
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}">`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}">`,
    '<meta property="og:image:alt" content="Ambitt Agents">',
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${image}">`,
    style,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** The route handlers' whole job: a finished document, as text/html. */
export function editorialResponse(fragment: string, meta: EditorialMeta): Response {
  return new Response(renderEditorialDocument(fragment, meta), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
