// ---------------------------------------------------------------------------
// Onboarding Content Generators
// ---------------------------------------------------------------------------
// Each generator invokes runAgent with billable:false and a seed prompt
// tuned to the email's purpose. The agent reads its own memory + conversation
// history and writes personalized plain-text body content that the email
// templates render into HTML.
//
// Principle: personalization is the moat. Generic drip emails undermine the
// entire "dedicated agent" positioning. Every email must reference something
// specific about THIS business.
// ---------------------------------------------------------------------------

import { runAgent } from "../shared/runtime/index.js";
import prisma from "../shared/db.js";
import { canAddAgent, type PricingTier } from "../shared/pricing.js";
import logger from "../shared/logger.js";

interface ContentResult {
  body: string;
  /** Best-effort flag — true if the generator returned a non-empty body. */
  ok: boolean;
}

// Hard length cap enforced in the prompt; the renderer doesn't truncate.
// Keeps cost bounded and output skimmable.
const MAX_BODY_CHARS = 1800;

async function invokeAgent(agentId: string, prompt: string, threadId: string): Promise<string> {
  const result = await runAgent({
    agentId,
    userMessage: prompt,
    channel: "email",
    threadId,
    billable: false,
  });
  return result.response.trim();
}

/**
 * T+5min — "How to work with me."
 * Explains day-to-day mechanics: how to reply, how to share more docs, when
 * scheduled runs fire, how to escalate. AI-personalized so the copy feels
 * written FOR them, not templated.
 */
export async function generateHowToWorkBody(agentId: string): Promise<ContentResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: { select: { preferredName: true, businessName: true } } },
  });
  if (!agent) return { body: "", ok: false };

  const preferredName = agent.client.preferredName ?? agent.client.businessName;
  const scheduleNote = agent.schedule === "manual" ? "on-demand (when you ask)" : `on this cron: ${agent.schedule}`;

  const prompt = [
    `Write a short "how to work with me" email to ${preferredName} at ${agent.client.businessName}.`,
    `You met them on a setup call a few minutes ago. They already know your name and purpose.`,
    ``,
    `Cover these mechanics in your own voice — do NOT bullet them mechanically, weave them into 3-4 short paragraphs:`,
    `1. To give you a task: reply to any email from you. Plain English. No special format.`,
    `2. To share more documents (SOPs, brand guides, reports): reply with the subject "DOCS" and attach the files.`,
    `3. Scheduled runs fire ${scheduleNote}. You'll email them results.`,
    `4. If something feels off, reply and tell them — they can adjust your approach any time.`,
    ``,
    `Rules:`,
    `- NO greeting ("Hi Kyle"). The template handles that.`,
    `- NO sign-off ("— ${agent.name}"). The template handles that.`,
    `- Max ${MAX_BODY_CHARS} characters. Under 1200 is better.`,
    `- Reference ONE specific thing about ${agent.client.businessName} you already know — pull from memory or the Zoom context. Proves you remembered.`,
    `- No tool calls needed. Write this from what you already know.`,
    `- Warm, human, direct. No corporate speak.`,
  ].join("\n");

  try {
    const body = await invokeAgent(agentId, prompt, `onboarding-how-to-${agentId}`);
    return { body: body.slice(0, MAX_BODY_CHARS), ok: body.length > 0 };
  } catch (error) {
    logger.error("generateHowToWorkBody failed", { agentId, error });
    return { body: "", ok: false };
  }
}

/**
 * T+3 — Check-in. Catches silent dissatisfaction by asking one open question.
 * Must reference one specific thing the agent delivered in the last 3 days.
 */
export async function generateCheckinBody(agentId: string): Promise<ContentResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: { select: { preferredName: true, businessName: true } } },
  });
  if (!agent) return { body: "", ok: false };

  const preferredName = agent.client.preferredName ?? agent.client.businessName;

  const prompt = [
    `Write a short check-in email to ${preferredName} at ${agent.client.businessName}. It's been 3 days since you were activated.`,
    ``,
    `Structure: 2 paragraphs, max 3.`,
    `- Paragraph 1: reference ONE specific thing you've delivered for them in the last 3 days (pull from your conversation history). Be concrete — mention the actual thing, not "some work."`,
    `- Paragraph 2: ask one open question. Something like "Is anything off?" or "Anything you'd adjust?" — but in YOUR voice, not a template.`,
    `- Optional paragraph 3: one quick observation about their business if you have one, offered as a heads-up. Skip if nothing meaningful comes to mind.`,
    ``,
    `Rules:`,
    `- NO greeting or sign-off. Template handles both.`,
    `- Max ${MAX_BODY_CHARS} characters. Shorter is better.`,
    `- If you haven't delivered anything yet (no scheduled runs yet), acknowledge that — say something like "I haven't shipped anything for you yet, but here's what I'll be working on next."`,
    `- No tool calls needed. Write from your own memory + conversation history.`,
    `- Human. Not corporate check-in survey tone.`,
  ].join("\n");

  try {
    const body = await invokeAgent(agentId, prompt, `onboarding-checkin-${agentId}`);
    return { body: body.slice(0, MAX_BODY_CHARS), ok: body.length > 0 };
  } catch (error) {
    logger.error("generateCheckinBody failed", { agentId, error });
    return { body: "", ok: false };
  }
}

/**
 * T+7 — Capability highlight. Pitches ONE specific unused capability, grounded
 * in the client's business.
 */
export async function generateHighlightBody(agentId: string): Promise<ContentResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { client: { select: { preferredName: true, businessName: true, industry: true } } },
  });
  if (!agent) return { body: "", ok: false };

  const preferredName = agent.client.preferredName ?? agent.client.businessName;

  const prompt = [
    `Write a short "one more thing I can do" email to ${preferredName} at ${agent.client.businessName}. It's been 7 days since activation.`,
    ``,
    `Your goal: surface ONE specific capability you have that they haven't used yet, and offer to start. Not a menu. One thing.`,
    ``,
    `How to pick it:`,
    `- Look at your tools, memory, and what you know about ${agent.client.businessName} (industry: ${agent.client.industry}).`,
    `- Pick the unused capability that would most clearly help this specific business. Not a generic feature — something that solves a specific problem you can name.`,
    ``,
    `Structure: 2-3 short paragraphs.`,
    `- Paragraph 1: observation about their business that sets up the capability. Concrete, not generic.`,
    `- Paragraph 2: "By the way, I can also ___." Describe the capability in plain English and tie it to their specific case.`,
    `- Paragraph 3: simple open offer — "Want me to?" or "Say the word and I'll start."`,
    ``,
    `Rules:`,
    `- NO greeting or sign-off. Template handles both.`,
    `- Max ${MAX_BODY_CHARS} characters.`,
    `- If you want to cite a specific current fact about their industry, web_search is available — but only if the citation genuinely strengthens the pitch. Don't search just for the sake of it.`,
    `- Warm, confident, not salesy.`,
  ].join("\n");

  try {
    const body = await invokeAgent(agentId, prompt, `onboarding-highlight-${agentId}`);
    return { body: body.slice(0, MAX_BODY_CHARS), ok: body.length > 0 };
  } catch (error) {
    logger.error("generateHighlightBody failed", { agentId, error });
    return { body: "", ok: false };
  }
}

/**
 * T+14 — Feedback + optional second-agent pitch.
 * Always asks for honest feedback. Pitches a second agent ONLY if the tier has
 * room — otherwise the pitch is omitted (not replaced with an upgrade pitch
 * here; upgrade nudges are a separate flow later).
 */
export async function generateFeedbackBody(agentId: string): Promise<ContentResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      client: { select: { id: true, preferredName: true, businessName: true, industry: true } },
    },
  });
  if (!agent) return { body: "", ok: false };

  const preferredName = agent.client.preferredName ?? agent.client.businessName;
  const tier = agent.pricingTier as PricingTier;
  const hasRoomForAnother = await canAddAgent(agent.client.id, tier);

  const secondAgentBlock = hasRoomForAnother
    ? `Block 2 — second agent pitch: propose ONE specific adjacent function you think a second dedicated agent could handle for ${agent.client.businessName}. Be specific — name the function, explain the gap it would fill, offer to draft a spec. 2-3 sentences. Only include this block if you can name a genuinely useful second agent — don't force it.`
    : `Block 2: OMIT. They have no room for another agent on their current tier. Do not mention it.`;

  const prompt = [
    `Write a two-week feedback email to ${preferredName} at ${agent.client.businessName}. It's been 14 days since activation.`,
    ``,
    `Two blocks, separated by a blank line:`,
    ``,
    `Block 1 — feedback: ask for honest feedback. What's working? What's not? Make it clear you want the real answer, not a polite one. 2-3 sentences in your voice.`,
    ``,
    secondAgentBlock,
    ``,
    `Rules:`,
    `- NO greeting or sign-off. Template handles both.`,
    `- Max ${MAX_BODY_CHARS} characters.`,
    `- Direct, confident. No begging for ratings. No "we value your feedback" corporate tone.`,
    `- No tool calls needed.`,
  ].join("\n");

  try {
    const body = await invokeAgent(agentId, prompt, `onboarding-feedback-${agentId}`);
    return { body: body.slice(0, MAX_BODY_CHARS), ok: body.length > 0 };
  } catch (error) {
    logger.error("generateFeedbackBody failed", { agentId, error });
    return { body: "", ok: false };
  }
}
