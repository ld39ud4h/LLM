import { performance } from "node:perf_hooks";
import { logger } from "../config/logger.js";
import { generateAnswer, type TextChunkHandler } from "./ai.service.js";
import { getGuildSystemPrompt } from "./guild-settings.service.js";
import { getHistory, getHistoryForDate, getOrCreateConversation, saveMessage } from "./conversation.service.js";
import { listMemories } from "./memory.service.js";
import { getUserPersona } from "./user-persona.service.js";
import { runLocalTool } from "./tools/index.js";
import { planContextTools, type ContextToolName } from "./context-planner.service.js";

const RESET_STREAM = "\u0000RESET_STREAM\u0000";

function isGreeting(prompt: string): boolean {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /^(?:(?:oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|salve|fala|hey|hello|hi)\b[\s,!.?]*(?:(?:meu amigo|amigo|chat|tudo bem|beleza|como vai|pode me ajudar|consegue me ajudar)[\s,!.?]*)*)$/i.test(text);
}

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

  const greeting = isGreeting(input.prompt);
  let conversationId: string | undefined;
  let history: Awaited<ReturnType<typeof getHistory>> = [];
  let memories: string[] = [];
  let systemPrompt: string | undefined;
  let userPersona: string | undefined;
  let answer = "";

  const provisionalPromise = !greeting
    ? generateAnswer([], input.prompt, [], undefined, undefined, onChunk)
    : Promise.resolve(undefined);
  const dbStartedAt = performance.now();

  if (!greeting) {
    conversationId = await getOrCreateConversation(input.discordUserId, input.username, input.channelId);
    const selectedTools = await planContextTools(input.prompt);
    const tasks: Promise<unknown>[] = [];
    const uniqueTools = [...new Set<ContextToolName>(selectedTools)];
    if (uniqueTools.includes("get_yesterday_history")) {
      tasks.push(getHistoryForDate(conversationId, "yesterday").then((value) => { history = value; }));
    } else if (uniqueTools.includes("get_recent_history")) {
      tasks.push(getHistory(conversationId).then((value) => { history = value; }));
    }
    if (uniqueTools.includes("get_user_memories")) tasks.push(listMemories(input.discordUserId).then((value) => { memories = value; }));
    if (uniqueTools.includes("get_guild_settings")) tasks.push(getGuildSystemPrompt(input.guildId).then((value) => { systemPrompt = value; }));
    if (uniqueTools.includes("get_user_persona")) tasks.push(getUserPersona(input.discordUserId).then((value) => { userPersona = value; }));
    await Promise.all(tasks);
    logger.info({
      feature: "chat-pipeline",
      phase: "context-loaded",
      userId: input.discordUserId,
      durationMs: Math.round(performance.now() - dbStartedAt),
      selectedTools: uniqueTools,
      historyTurns: history.length,
      memoryCount: memories.length,
    }, "Model-selected context tools completed");
  }

  const provisional = await provisionalPromise;
  const hasAdditionalContext = history.length > 0 || memories.length > 0 || Boolean(systemPrompt?.trim()) || Boolean(userPersona?.trim());
  if (provisional && !hasAdditionalContext) {
    answer = provisional;
  } else {
    if (provisional) await onChunk?.(RESET_STREAM);
    const generationStartedAt = performance.now();
    answer = await generateAnswer(history, input.prompt, memories, systemPrompt, userPersona, onChunk);
    logger.info({ feature: "chat-pipeline", phase: "generation-finished", userId: input.discordUserId, durationMs: Math.round(performance.now() - generationStartedAt), replacedProvisional: Boolean(provisional) }, "Answer generation finished");
  }

  if (conversationId) {
    const persistenceStartedAt = performance.now();
    await saveMessage(conversationId, "user", input.prompt);
    await saveMessage(conversationId, "model", answer);
    logger.info({ feature: "chat-pipeline", phase: "messages-saved", userId: input.discordUserId, durationMs: Math.round(performance.now() - persistenceStartedAt), totalDurationMs: Math.round(performance.now() - requestStartedAt) }, "Conversation messages saved");
  }
  return answer;
}
