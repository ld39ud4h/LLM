import { performance } from "node:perf_hooks";
import { logger } from "../config/logger.js";
import { generateAnswer, type TextChunkHandler } from "./ai.service.js";
import { getGuildSystemPrompt } from "./guild-settings.service.js";
import { getHistory, getHistoryForDate, getOrCreateConversation, saveMessage } from "./conversation.service.js";
import { listMemories } from "./memory.service.js";
import { getUserPersona } from "./user-persona.service.js";
import { runLocalTool } from "./tools/index.js";

type ContextPlan = { history: "none" | "recent" | "yesterday"; memories: boolean; settings: boolean };

function planContext(prompt: string): ContextPlan {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const greetingOnly = /^(?:oi|ola|opa|eai|e aí|bom dia|boa tarde|boa noite|salve|fala|hey|hello|hi)(?:\s+(?:meu amigo|amigo|chat|tudo bem|beleza|como vai))*[!?.,\s]*$/i.test(text);
  if (greetingOnly) return { history: "none", memories: false, settings: false };

  const asksYesterday = /\b(ontem|conversa de ontem|mensagens de ontem|o que falamos ontem)\b/.test(text);
  const asksHistory = /\b(lembra|recorda|conversamos|falamos|discutimos|assunto que|aquela conversa|outra conversa|da outra vez|anteriormente|historico|mensagens anteriores)\b/.test(text);
  const asksMemory = /\b(minha memoria|o que voce lembra|lembra de mim|lembra que|recorda que|salvei|te pedi para lembrar)\b/.test(text);
  const history: ContextPlan["history"] = asksYesterday ? "yesterday" : asksHistory ? "recent" : "none";
  return {
    history,
    memories: asksMemory || asksHistory,
    settings: true,
  };
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

  const plan = planContext(input.prompt);
  const isGreeting = plan.history === "none" && !plan.memories && !plan.settings;
  const dbStartedAt = performance.now();
  let conversationId: string | undefined;
  let history: Awaited<ReturnType<typeof getHistory>> = [];
  let memories: string[] = [];
  let systemPrompt: string | undefined;
  let userPersona: string | undefined;

  if (!isGreeting) {
    conversationId = await getOrCreateConversation(input.discordUserId, input.username, input.channelId);
    const tasks: Promise<unknown>[] = [];
    const historyTask = plan.history === "yesterday"
      ? getHistoryForDate(conversationId, "yesterday")
      : plan.history === "recent" ? getHistory(conversationId) : Promise.resolve([]);
    tasks.push(historyTask.then((value) => { history = value as typeof history; }));
    if (plan.memories) tasks.push(listMemories(input.discordUserId).then((value) => { memories = value; }));
    if (plan.settings) {
      tasks.push(getGuildSystemPrompt(input.guildId).then((value) => { systemPrompt = value; }));
      tasks.push(getUserPersona(input.discordUserId).then((value) => { userPersona = value; }));
    }
    await Promise.all(tasks);
  }

  logger.info({
    feature: "chat-pipeline",
    phase: "context-loaded",
    userId: input.discordUserId,
    durationMs: Math.round(performance.now() - dbStartedAt),
    historyTurns: history.length,
    memoryCount: memories.length,
    historyScope: plan.history,
    memoriesQueried: plan.memories,
    settingsQueried: plan.settings,
  }, "Selective chat context loaded");

  const generationStartedAt = performance.now();
  const answer = await generateAnswer(history, input.prompt, memories, systemPrompt, userPersona, onChunk);
  logger.info({ feature: "chat-pipeline", phase: "generation-finished", userId: input.discordUserId, durationMs: Math.round(performance.now() - generationStartedAt) }, "Answer generation finished");

  if (conversationId) {
    const persistenceStartedAt = performance.now();
    await saveMessage(conversationId, "user", input.prompt);
    await saveMessage(conversationId, "model", answer);
    logger.info({ feature: "chat-pipeline", phase: "messages-saved", userId: input.discordUserId, durationMs: Math.round(performance.now() - persistenceStartedAt), totalDurationMs: Math.round(performance.now() - requestStartedAt) }, "Conversation messages saved");
  }
  return answer;
}
