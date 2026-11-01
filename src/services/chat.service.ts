import { performance } from "node:perf_hooks";
import { logger } from "../config/logger.js";
import { generateAnswer, type TextChunkHandler } from "./ai.service.js";
import { getGuildSystemPrompt } from "./guild-settings.service.js";
import { getHistory, getOrCreateConversation, saveMessage } from "./conversation.service.js";
import { listMemories } from "./memory.service.js";
import { getUserPersona } from "./user-persona.service.js";
import { runLocalTool } from "./tools/index.js";

export async function replyToUser(
  input: { discordUserId: string; username: string; channelId: string; guildId: string | null; prompt: string },
  onChunk?: TextChunkHandler,
): Promise<string> {
  const requestStartedAt = performance.now();
  const toolResult = runLocalTool(input.prompt);
  if (toolResult.handled) {
    logger.info({ feature: "local-tool", tool: toolResult.name, userId: input.discordUserId, durationMs: Math.round(performance.now() - requestStartedAt) }, "Local tool executed");
    await onChunk?.(toolResult.response);
    return toolResult.response;
  }

  const dbStartedAt = performance.now();
  const conversationId = await getOrCreateConversation(input.discordUserId, input.username, input.channelId);
  const [history, memories, systemPrompt, userPersona] = await Promise.all([
    getHistory(conversationId),
    listMemories(input.discordUserId),
    getGuildSystemPrompt(input.guildId),
    getUserPersona(input.discordUserId),
  ]);
  logger.info({
    feature: "chat-pipeline",
    phase: "context-loaded",
    userId: input.discordUserId,
    durationMs: Math.round(performance.now() - dbStartedAt),
    historyTurns: history.length,
    memoryCount: memories.length,
    hasCustomPersona: Boolean(userPersona),
  }, "Chat context loaded");

  const generationStartedAt = performance.now();
  const answer = await generateAnswer(history, input.prompt, memories, systemPrompt, userPersona, onChunk);
  logger.info({ feature: "chat-pipeline", phase: "generation-finished", userId: input.discordUserId, durationMs: Math.round(performance.now() - generationStartedAt) }, "Answer generation finished");

  const persistenceStartedAt = performance.now();
  await saveMessage(conversationId, "user", input.prompt);
  await saveMessage(conversationId, "model", answer);
  logger.info({ feature: "chat-pipeline", phase: "messages-saved", userId: input.discordUserId, durationMs: Math.round(performance.now() - persistenceStartedAt), totalDurationMs: Math.round(performance.now() - requestStartedAt) }, "Conversation messages saved");
  return answer;
}
