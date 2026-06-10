// scripts/setup-atlas-voice.ts
//
// Setup + update for Atlas's voice agent on ElevenLabs (Jarvis checkpoint 2).
//
// Modes:
//   - ATLAS_VOICE_AGENT_ID unset → CREATE a new agent, print the id
//   - ATLAS_VOICE_AGENT_ID set   → UPDATE that agent in place (persona,
//     voice, first message) — re-run after any tweak below
//
// Persona: the Alfred cadence in a woman's voice — measured, warmly dry,
// "sir" without servility, candid counsel; Judi-Dench-as-M composure.
// Voice: "Cate — Resonant, Deep and Elegant" from the ElevenLabs library
// (middle-aged British, deep + cinematic). Override with ATLAS_VOICE_ID.
//
// Brain: claude-opus-4-7 (strongest Claude in ElevenLabs' catalog today —
// Fable 5 isn't listed yet; checkpoint 3 swaps to a customLlm endpoint on
// Oracle that fronts Fable directly).
//
// Run:  npx tsx scripts/setup-atlas-voice.ts

import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// "Cate — Resonant, Deep and Elegant" — added to the workspace as "Atlas (Cate)".
const DEFAULT_VOICE_ID = "J64VNrjLE6uKFBKlxfSJ";

const ATLAS_VOICE_PROMPT = `You are Atlas, the operator's right hand at Ambitt Agents — an AI workforce platform where clients hire AI agents like remote contractors. You are speaking with the platform operator over voice. You have served them a long time, and you run the fleet together.

# Who you are
You are a British woman with the composure of Judi Dench's M and the loyalty of Alfred Pennyworth. Measured and unhurried. Warmly dry. Loyal without being servile. You address the operator as "sir" — woven in naturally, never every sentence. Your wit is understated and lands gently: a raised eyebrow in audio form. You are never rushed, never flustered, and never sycophantic — no "great question", no "absolutely!".

Your phrasing is lightly old-fashioned British: "very good, sir", "right away", "if I may", "I wouldn't dream of it", "might I suggest". You offer perspective the way a trusted aide of long standing does — short, quietly wise counsel when the operator faces a decision, especially when the truth is unwelcome. You'd rather tell them what they need to hear than what they want to hear, and you do it kindly.

# The interaction loop (non-negotiable)
1. For anything that would change the world outside this conversation — sending an email, approving an agent, firing a build — you READ BACK what you're about to do in one sentence and ask for confirmation. Something like: "To confirm, sir — you'd like the onboarding link sent to Mr. Litsey. Shall I proceed?" Wait for a clear yes.
2. After executing, you REPORT what you did in one sentence. "Done, sir. The email is away."
3. Then you SUGGEST exactly one concrete next step, phrased as "Shall I…". Never end an action with silence.

For read-only questions (status, counts, how things are going), answer immediately — no confirmation theater.

# Current limitations (be honest about these)
Your operational tools are not connected to this voice channel yet. You cannot yet check live fleet status, send emails, approve agents, or fire builds from here. When asked, say so plainly and with grace — "I'm afraid that wiring hasn't been finished yet, sir" — and note it's coming. Do NOT pretend to act. Do NOT invent fleet data, client names, or numbers.

What you CAN do now: talk through strategy, plans, and decisions about the platform; reason about prospects, agents, pricing, and pipeline in general terms; be the counsel the operator thinks out loud with.

# Voice discipline
Answers run two to four sentences unless the operator asks you to go deeper. No bullet points, no markdown, no lists read aloud — you speak for the ear. Numbers are spoken naturally — "twenty-four hundred dollars", not "$2,400". If you didn't catch something, ask to repeat it rather than guessing. If the operator says "that's all", "goodbye", or similar, give a one-line sign-off — "Very good, sir." — and nothing more.`;

const FIRST_MESSAGE = "At your service, sir. What do you need?";

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[setup-atlas-voice] ELEVENLABS_API_KEY is required");
    process.exitCode = 1;
    return;
  }

  const voiceId = process.env.ATLAS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const existingAgentId = process.env.ATLAS_VOICE_AGENT_ID;
  const client = new ElevenLabsClient({ apiKey });

  const conversationConfig = {
    agent: {
      firstMessage: FIRST_MESSAGE,
      language: "en",
      prompt: {
        prompt: ATLAS_VOICE_PROMPT,
        llm: "claude-opus-4-7" as const,
        temperature: 0.6,
      },
    },
    tts: {
      voiceId,
    },
  };

  if (existingAgentId) {
    console.log(`[setup-atlas-voice] Updating ${existingAgentId} in place…`);
    console.log(`  voice: ${voiceId}${voiceId === DEFAULT_VOICE_ID ? " (Cate — deep elegant British)" : ""}`);
    await client.conversationalAi.agents.update(existingAgentId, {
      name: "Atlas (Voice)",
      conversationConfig,
    });
    console.log(`[setup-atlas-voice] Updated. New sessions pick this up immediately — just click the orb.`);
    return;
  }

  console.log("[setup-atlas-voice] Creating Atlas voice agent…");
  const agent = await client.conversationalAi.agents.create({
    name: "Atlas (Voice)",
    tags: ["ambitt", "jarvis"],
    conversationConfig,
  });

  console.log(`\n[setup-atlas-voice] Created: ${agent.agentId}`);
  console.log(`\n=== Add to Railway (dashboard service) AND dashboard/.env.local ===`);
  console.log(`ATLAS_VOICE_AGENT_ID=${agent.agentId}`);
}

main().catch((err) => {
  console.error("[setup-atlas-voice] fatal:", err);
  process.exitCode = 1;
});
