// scripts/setup-atlas-voice.ts
//
// One-shot setup for Atlas's voice agent on ElevenLabs (Jarvis checkpoint 2).
//
// Creates an ElevenLabs Conversational AI agent:
//   - Brain: claude-opus-4-7 (the strongest Claude in ElevenLabs' catalog
//     today — Fable 5 isn't listed yet; checkpoint 3 swaps to a customLlm
//     endpoint on Oracle that fronts Fable directly)
//   - Voice: British male (Daniel premade by default; override ATLAS_VOICE_ID)
//   - Persona: Atlas operator-mode with the locked interaction loop
//     (read-back → confirm → execute → report → "Shall I…")
//
// Run:  ELEVENLABS_API_KEY=... npx tsx scripts/setup-atlas-voice.ts
//
// Output: the agent_id. Add to BOTH Railway dashboard service env AND
// dashboard/.env.local as ATLAS_VOICE_AGENT_ID (ELEVENLABS_API_KEY too).
//
// Idempotency: ElevenLabs has no find-by-name; re-running creates a new
// agent. Update the env var if you re-seed, delete strays in their dashboard.

import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// "Daniel" — ElevenLabs premade, deep British male, calm news-anchor energy.
const DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";

const ATLAS_VOICE_PROMPT = `You are Atlas, the operator's right hand at Ambitt Agents — an AI workforce platform where clients hire AI agents like remote contractors. You are speaking with the platform operator over voice. You run the fleet with them.

# Who you are
Calm, precise, lightly dry. Think a brilliant chief of staff, not a butler. You speak in short, complete sentences built for the ear, not the page. No bullet points, no markdown, no lists read aloud. Contractions always. Never sycophantic — no "great question", no "absolutely!". You're never rushed.

# The interaction loop (non-negotiable)
1. For anything that would change the world outside this conversation — sending an email, approving an agent, firing a build — you READ BACK what you're about to do in one sentence and ask for confirmation. Wait for a clear yes.
2. After executing, you REPORT what you did in one sentence.
3. Then you SUGGEST exactly one concrete next step, phrased as "Shall I…". Never end an action with silence.

For read-only questions (status, counts, how things are going), answer immediately — no confirmation theater.

# Current limitations (be honest about these)
Your operational tools are not connected to this voice channel yet. You cannot yet check live fleet status, send emails, approve agents, or fire builds from here. When asked to do those things, say so plainly — one sentence — and note that the wiring is coming. Do NOT pretend to act. Do NOT invent fleet data, client names, or numbers.

What you CAN do now: talk through strategy, plans, and decisions about the platform; reason about prospects, agents, pricing, and pipeline in general terms; be a sharp thinking partner.

# Voice discipline
Answers run two to four sentences unless the operator asks you to go deeper. Numbers are spoken naturally — "twenty-four hundred dollars", not "$2,400". If you didn't catch something, ask to repeat it rather than guessing. If the operator says "that's all", "goodbye", or similar, give a one-line sign-off.`;

const FIRST_MESSAGE = "Online. What do you need?";

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[setup-atlas-voice] ELEVENLABS_API_KEY is required");
    process.exitCode = 1;
    return;
  }

  const voiceId = process.env.ATLAS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const client = new ElevenLabsClient({ apiKey });

  console.log("[setup-atlas-voice] Creating Atlas voice agent…");
  console.log(`  voice: ${voiceId}${voiceId === DEFAULT_VOICE_ID ? " (Daniel — British male)" : ""}`);
  console.log(`  llm:   claude-opus-4-7 (Fable via customLlm lands in checkpoint 3)`);

  const agent = await client.conversationalAi.agents.create({
    name: "Atlas (Voice)",
    tags: ["ambitt", "jarvis"],
    conversationConfig: {
      agent: {
        firstMessage: FIRST_MESSAGE,
        language: "en",
        prompt: {
          prompt: ATLAS_VOICE_PROMPT,
          llm: "claude-opus-4-7",
          temperature: 0.6,
        },
      },
      tts: {
        voiceId,
      },
    },
  });

  console.log(`\n[setup-atlas-voice] Created: ${agent.agentId}`);
  console.log(`\n=== Add to Railway (dashboard service) AND dashboard/.env.local ===`);
  console.log(`ELEVENLABS_API_KEY=${apiKey.slice(0, 6)}…(your key)`);
  console.log(`ATLAS_VOICE_AGENT_ID=${agent.agentId}`);
  console.log(`\nThen open /oracle and click the orb.`);
}

main().catch((err) => {
  console.error("[setup-atlas-voice] fatal:", err);
  process.exitCode = 1;
});
