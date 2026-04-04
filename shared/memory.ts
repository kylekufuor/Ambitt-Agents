import prisma from "./db.js";
import { encrypt, decrypt } from "./encryption.js";
import logger from "./logger.js";

interface MemoryObject {
  [key: string]: unknown;
}

export async function getMemory(agentId: string): Promise<MemoryObject> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { clientMemoryObject: true },
  });

  if (!agent?.clientMemoryObject) return {};

  try {
    const decrypted = decrypt(agent.clientMemoryObject);
    return JSON.parse(decrypted) as MemoryObject;
  } catch (error) {
    logger.error("Failed to decrypt/parse memory", { agentId, error });
    return {};
  }
}

export async function updateMemory(
  agentId: string,
  updates: MemoryObject
): Promise<void> {
  const current = await getMemory(agentId);
  const merged = { ...current, ...updates };
  const encrypted = encrypt(JSON.stringify(merged));

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      clientMemoryObject: encrypted,
      lastMemoryUpdateAt: new Date(),
    },
  });

  logger.info("Memory updated", { agentId, keys: Object.keys(updates) });
}

export async function getConversationHistory(
  agentId: string,
  limit = 50
): Promise<
  Array<{ role: string; content: string; channel: string; createdAt: Date }>
> {
  return prisma.conversationMessage.findMany({
    where: {
      agentId,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      role: true,
      content: true,
      channel: true,
      createdAt: true,
    },
  });
}

export async function archiveOldMessages(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await prisma.conversationMessage.updateMany({
    where: {
      archivedAt: null,
      createdAt: { lt: ninetyDaysAgo },
    },
    data: { archivedAt: new Date() },
  });

  if (result.count > 0) {
    logger.info(`Archived ${result.count} old messages`);
  }

  return result.count;
}

export default { getMemory, updateMemory, getConversationHistory, archiveOldMessages };
