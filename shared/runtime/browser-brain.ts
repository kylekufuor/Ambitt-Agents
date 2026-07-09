import Anthropic from "@anthropic-ai/sdk";
import logger from "../logger.js";
import { CLIENT_MODEL } from "../claude.js";

// ---------------------------------------------------------------------------
// Browser brain — decides the single next action for a local browse task
// ---------------------------------------------------------------------------
// The Chrome extension drives the client's own tab but has no judgement. Each
// step it sends up a screenshot of the current page; this module shows that to
// Claude (vision) along with the goal and the actions taken so far, and returns
// the one next action to perform. The extension executes it via chrome.debugger
// and loops. Brain stays on the platform, so the supervised gate, the tracker,
// and observability all live in one place.
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface BrowserActionRequest {
  goal: string;
  screenshotBase64: string; // PNG, no data: prefix
  imgW: number; // screenshot pixel dimensions (coordinates are in this space)
  imgH: number;
  url: string;
  history: Array<{ action: string; note?: string }>;
  stepIndex: number;
}

export interface BrowserAction {
  action: "click" | "type" | "key" | "scroll" | "navigate" | "done" | "fail";
  x?: number;
  y?: number;
  dy?: number;
  text?: string;
  key?: string;
  url?: string;
  result?: string;
  reason?: string;
}

const ACTION_TOOL = {
  name: "browser_action",
  description: "Perform the single next action in the browser to make progress toward the goal.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["click", "type", "key", "scroll", "navigate", "done", "fail"],
        description: "click a point, type text into the focused field, press a key, scroll, navigate to a URL, finish (done), or give up (fail).",
      },
      x: { type: "number", description: "X coordinate (image pixels) for a click." },
      y: { type: "number", description: "Y coordinate (image pixels) for a click." },
      dy: { type: "number", description: "Vertical scroll amount in pixels, positive = down. For scroll." },
      text: { type: "string", description: "Text to type. For type. Click the field in a prior step first." },
      key: { type: "string", description: "Key name for key, e.g. Enter, Tab, Escape, Backspace." },
      url: { type: "string", description: "Absolute URL to navigate to. For navigate." },
      result: { type: "string", description: "The extracted answer or data. Required for done." },
      reason: { type: "string", description: "One short line: why this action, or why you're failing." },
    },
    required: ["action"],
  },
};

export async function decideBrowserAction(req: BrowserActionRequest): Promise<BrowserAction> {
  const system = `You are operating a real web browser one action at a time to accomplish a goal. You are shown a screenshot of the current page. The image is ${req.imgW} by ${req.imgH} pixels; every coordinate you give must be in that pixel space.

GOAL: ${req.goal}

Rules:
- Return exactly ONE action, via the browser_action tool, each turn.
- Click the visual center of the target element.
- To fill a field: click it in one step, then "type" in the next step, then "key" Enter to submit if needed.
- When the goal is achieved, use "done" and put the answer or the extracted data in "result".
- If it is genuinely impossible or you are blocked (login wall you can't pass, captcha), use "fail" with a short "reason".
- Never repeat an action that already failed; try something different.
- Prefer scrolling to reveal content over guessing at offscreen elements.`;

  const historyText = req.history.length
    ? "Actions so far:\n" + req.history.map((h, i) => `${i + 1}. ${h.action}${h.note ? " — " + h.note : ""}`).join("\n")
    : "No actions yet. This is the first step.";

  try {
    const res = await anthropic().messages.create({
      model: CLIENT_MODEL,
      max_tokens: 1024,
      system,
      tools: [ACTION_TOOL],
      tool_choice: { type: "tool", name: "browser_action" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: req.screenshotBase64 } },
            { type: "text", text: `Current URL: ${req.url}\nStep ${req.stepIndex + 1}.\n${historyText}\n\nWhat is the single next action?` },
          ],
        },
      ],
    });
    const toolUse = res.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { action: "fail", reason: "No action returned by the model." };
    }
    return toolUse.input as BrowserAction;
  } catch (error) {
    logger.error("decideBrowserAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { action: "fail", reason: "Brain error deciding the next action." };
  }
}
