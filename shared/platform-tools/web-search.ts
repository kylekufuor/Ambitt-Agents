import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Web Search — Tavily API (built for AI agents)
// ---------------------------------------------------------------------------
// Searches the web and returns clean, structured results optimized for LLMs.
// Free tier: 1,000 searches/month. No scraping, no browser needed.
//
// Env: TAVILY_API_KEY
// ---------------------------------------------------------------------------

const TAVILY_API = "https://api.tavily.com/search";

export interface WebSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  answer: string | null;
}

export async function webSearch(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
  }
): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

  const { maxResults = 5, searchDepth = "basic", includeAnswer = true } = options ?? {};

  const response = await fetch(TAVILY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: searchDepth,
      include_answer: includeAnswer,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("Tavily search failed", { query, status: response.status, body: body.slice(0, 200) });
    throw new Error(`Web search failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();

  const results = (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
    score: r.score ?? 0,
  }));

  logger.info("Web search complete", { query, resultCount: results.length });

  return {
    query,
    results,
    answer: data.answer ?? null,
  };
}

export function formatSearchResults(result: WebSearchResult): string {
  const lines: string[] = [];

  lines.push(`## Web Search: "${result.query}"`);
  lines.push("");

  if (result.answer) {
    lines.push(`### Summary`);
    lines.push(result.answer);
    lines.push("");
  }

  if (result.results.length > 0) {
    lines.push(`### Sources (${result.results.length})`);
    for (const r of result.results) {
      lines.push(`- **${r.title}** (${r.url})`);
      if (r.content) {
        lines.push(`  ${r.content.slice(0, 300)}`);
      }
    }
  } else {
    lines.push("No results found.");
  }

  return lines.join("\n");
}
