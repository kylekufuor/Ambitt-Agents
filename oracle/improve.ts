import prisma from "../shared/db.js";
import { callClaude } from "../shared/claude.js";
import { sendKyleWhatsApp } from "../shared/whatsapp.js";
import logger from "../shared/logger.js";

interface ImprovementSuggestion {
  agentType: string;
  currentIssue: string;
  suggestedChange: string;
  confidence: "low" | "medium" | "high";
}

export async function runImprovementCycle(): Promise<ImprovementSuggestion[]> {
  // Gather signals from the past week, grouped by agent type
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const signals = await prisma.performanceSignal.findMany({
    where: {
      createdAt: { gte: oneWeekAgo },
      anonymized: true,
    },
    select: {
      agentType: true,
      signalType: true,
      outputSummary: true,
      clientAction: true,
    },
  });

  if (signals.length === 0) {
    logger.info("No performance signals to analyze this week");
    return [];
  }

  // Group by agent type
  const byType: Record<string, typeof signals> = {};
  for (const signal of signals) {
    if (!byType[signal.agentType]) byType[signal.agentType] = [];
    byType[signal.agentType].push(signal);
  }

  const suggestions: ImprovementSuggestion[] = [];

  for (const [agentType, typeSignals] of Object.entries(byType)) {
    const rejected = typeSignals.filter((s) => s.signalType === "rejected").length;
    const ignored = typeSignals.filter((s) => s.signalType === "ignored").length;
    const total = typeSignals.length;
    const negativeRate = (rejected + ignored) / total;

    // Only suggest improvements if negative signal rate > 30%
    if (negativeRate <= 0.3) continue;

    const signalSummary = typeSignals
      .map((s) => `[${s.signalType}] Output: ${s.outputSummary.slice(0, 100)} | Action: ${s.clientAction}`)
      .join("\n");

    const response = await callClaude({
      systemPrompt:
        "You are Oracle, the meta-agent for Ambitt Agents. Analyze performance signals and suggest ONE specific, actionable improvement to agent prompts or behavior. Be concise. Output JSON with fields: currentIssue, suggestedChange, confidence (low/medium/high).",
      userMessage:
        `Agent type: ${agentType}\n` +
        `Total signals: ${total}, Rejected: ${rejected}, Ignored: ${ignored}\n\n` +
        `Signals:\n${signalSummary}`,
    });

    try {
      const parsed = JSON.parse(response.content);
      suggestions.push({
        agentType,
        currentIssue: parsed.currentIssue,
        suggestedChange: parsed.suggestedChange,
        confidence: parsed.confidence,
      });
    } catch {
      logger.warn("Failed to parse improvement suggestion", { agentType });
    }
  }

  // Log and notify
  if (suggestions.length > 0) {
    await prisma.oracleAction.create({
      data: {
        actionType: "improvement_cycle",
        description: `Generated ${suggestions.length} improvement suggestion(s)`,
        status: "completed",
        result: JSON.stringify(suggestions),
      },
    });

    try {
      const summary = suggestions
        .map(
          (s) =>
            `• ${s.agentType}: ${s.suggestedChange.slice(0, 100)} (${s.confidence} confidence)`
        )
        .join("\n");

      await sendKyleWhatsApp(
        `📊 Weekly Improvement Cycle\n\n${suggestions.length} suggestion(s):\n${summary}\n\nReview in dashboard to approve or reject.`
      );
    } catch (error) {
      logger.error("Failed to send improvement notification", { error });
    }
  }

  logger.info("Improvement cycle complete", { suggestions: suggestions.length });
  return suggestions;
}

export default { runImprovementCycle };
