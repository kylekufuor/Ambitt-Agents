import Anthropic from "@anthropic-ai/sdk";
import logger from "../logger.js";
import { CLIENT_MODEL } from "../claude.js";

// ---------------------------------------------------------------------------
// Browser brain (accessibility-first) — decides the next action from a
// STRUCTURED snapshot of the page, not a screenshot.
// ---------------------------------------------------------------------------
// The remote-hands worker distills the page into a list of interactive
// elements (each with a stable [ref]) + the visible text, and sends that here.
// Claude picks the next action against a real element by ref — no coordinate
// guessing, no vision cost. This is the perception model the research found
// serious agents converge on (browser-use, Playwright MCP, Claude-in-Chrome).
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface A11yElement {
  ref: number;
  tag: string;
  role: string;
  type: string;
  name: string;
}

export interface A11yActionRequest {
  goal: string;
  url: string;
  title: string;
  elements: A11yElement[];
  text: string;
  history: Array<{ action: string; note?: string }>;
  stepIndex: number;
}

export interface A11yAction {
  action: "click" | "type" | "press" | "scroll" | "navigate" | "done" | "fail";
  ref?: number;
  text?: string;
  key?: string;
  url?: string;
  dir?: "down" | "up";
  result?: string;
  reason?: string;
}

const ACT_TOOL = {
  name: "act",
  description: "Perform the single next action to make progress toward the goal.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["click", "type", "press", "scroll", "navigate", "done", "fail"],
        description: "click an element by ref, type into a field by ref, press a key, scroll, navigate to a URL, finish (done), or give up (fail).",
      },
      ref: { type: "number", description: "The [ref] number of the element, for click and type." },
      text: { type: "string", description: "Text to type into the ref'd field. For type; it clears then types." },
      key: { type: "string", description: "Key to press, e.g. Enter, Tab, Escape. For press." },
      url: { type: "string", description: "Absolute URL to navigate to. For navigate." },
      dir: { type: "string", enum: ["down", "up"], description: "Scroll direction. For scroll." },
      result: { type: "string", description: "The extracted answer or data. Required for done." },
      reason: { type: "string", description: "One short line: why this action, or why you're failing." },
    },
    required: ["action"],
  },
};

export async function decideA11yAction(req: A11yActionRequest): Promise<A11yAction> {
  const elems = req.elements
    .slice(0, 220)
    .map((e) => `[${e.ref}] ${e.role || e.tag}${e.type ? ` (${e.type})` : ""} "${e.name}"`)
    .join("\n");
  const hist = req.history.length
    ? req.history.map((h, i) => `${i + 1}. ${h.action}${h.note ? ` — ${h.note}` : ""}`).join("\n")
    : "none yet";

  const system = `You operate a real web browser one action at a time to accomplish a goal. Each turn you get the current page's interactive elements (each with a [ref] number) and its visible text. Choose the single next action via the act tool.

GOAL: ${req.goal}

Rules:
- FIRST, every turn, check whether the goal is ALREADY satisfied by the current page (its URL and visible text). If it is, use "done" immediately with the answer in "result". Do not take another action once you have what the goal asked for.
- Interpret the goal literally and minimally. Do exactly what's asked, then stop. Do NOT explore extra links, pages, or "similar" items once the specific task is done.
- To click something, use "click" with its [ref].
- To fill a field, use "type" with the field's [ref] and the text (it clears then types). If a field isn't in the list, click near it first.
- Use "press" with key "Enter" to submit a form or search.
- Use "scroll" to reveal content that isn't listed yet (but don't scroll repeatedly if nothing new appears — reconsider instead).
- If it's genuinely blocked or impossible (login wall you can't pass, captcha), use "fail" with a short "reason".
- Never repeat an action that already failed, and never re-click a link matching text you already followed; pick a different element or approach.`;

  const user = `URL: ${req.url}
Title: ${req.title}
Step ${req.stepIndex + 1}. Actions so far:
${hist}

Interactive elements:
${elems || "(none found)"}

Visible page text (truncated):
${req.text.slice(0, 6000)}

What is the single next action?`;

  try {
    const res = await anthropic().messages.create({
      model: CLIENT_MODEL,
      max_tokens: 1024,
      system,
      tools: [ACT_TOOL],
      tool_choice: { type: "tool", name: "act" },
      messages: [{ role: "user", content: user }],
    });
    const t = res.content.find((b) => b.type === "tool_use");
    if (!t || t.type !== "tool_use") return { action: "fail", reason: "No action returned." };
    return t.input as A11yAction;
  } catch (error) {
    logger.error("decideA11yAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { action: "fail", reason: "Brain error deciding the next action." };
  }
}
