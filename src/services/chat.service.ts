import { performance } from "node:perf_hooks";
import { logger } from "../config/logger.js";
import { generateAnswer, type TextChunkHandler } from "./ai.service.js";
import { getGuildSystemPrompt } from "./guild-settings.service.js";
import { getHistory, getHistoryForDate, getOrCreateConversation, saveMessage } from "./conversation.service.js";
import { listMemories } from "./memory.service.js";
import { getUserPersona } from "./user-persona.service.js";
import { runLocalToolByName } from "./tools/index.js";
import { planContextTools, type ContextToolName } from "./context-planner.service.js";

function isGreeting(prompt: string): boolean {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /^(?:(?:oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|salve|fala|hey|hello|hi)\b[\s,!.?]*(?:(?:meu amigo|amigo|chat|tudo bem|beleza|como vai|pode me ajudar|consegue me ajudar)[\s,!.?]*)*)$/i.test(text);
}

export async function replyToUser(
  input: { discordUserId: string; username: string; channelId: string; guildId: string | null; prompt: string },
  onChunk?: TextChunkHandler,
): Promise<string> {
  const requestStartedAt = performance.now();
  const greeting = isGreeting(input.prompt);
  let conversationId: string | undefined;
  let history: Awaited<ReturnType<typeof getHistory>> = [];
  let memories: string[] = [];
  let systemPrompt: string | undefined;
  let userPersona: string | undefined;
  let selectedTools: ContextToolName[] = [];
  let contextResultNote = "";
  const localToolResults: string[] = [];
  let answer = "";

  const provisionalChunks: string[] = [];
  const provisionalPromise = !greeting
    ? generateAnswer([], input.prompt, [], undefined, undefined, async (chunk) => { provisionalChunks.push(chunk); }).catch((error) => {
        logger.warn({ err: error, feature: "chat-pipeline", phase: "provisional-generation" }, "Provisional response failed; context-aware generation will handle the request");
        return undefined;
      })
    : Promise.resolve(undefined);
  const dbStartedAt = performance.now();

  if (!greeting) {
    conversationId = await getOrCreateConversation(input.discordUserId, input.username, input.channelId);
    selectedTools = await planContextTools(input.prompt);
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
    const contextToolNames = new Set(["get_recent_history", "get_yesterday_history", "get_user_memories", "get_guild_settings", "get_user_persona"]);
    const localToolNames = uniqueTools.filter((name) => !contextToolNames.has(name));
    for (const name of localToolNames) tasks.push(Promise.resolve(runLocalToolByName(name, input.prompt)).then((result) => {
      if (result.handled) localToolResults.push(result.response);
    }));
    await Promise.all(tasks);
    const notes: string[] = [];
    if (uniqueTools.includes("get_yesterday_history") && history.length === 0) notes.push("A consulta ao histórico de ontem não encontrou mensagens. Não invente o conteúdo de uma conversa; informe que não há registros desse período.");
    if (uniqueTools.includes("get_recent_history") && history.length === 0) notes.push("A consulta ao histórico recente não encontrou mensagens anteriores nesta conversa. Não invente fatos sobre conversas passadas.");
    if (uniqueTools.includes("get_user_memories") && memories.length === 0) notes.push("A consulta não encontrou memórias salvas para esta pessoa. Não afirme lembrar de fatos pessoais que não estejam disponíveis.");
    if (localToolResults.length) notes.push("Resultados confirmados das ferramentas locais:\\n" + localToolResults.map((result) => "- " + result).join("\\n"));
    if (uniqueTools.some((name) => !contextToolNames.has(name)) && localToolResults.length === 0) notes.push("A ferramenta local selecionada não conseguiu validar os dados desta solicitação. Não invente um resultado; peça os dados que faltam.");
    contextResultNote = notes.join("\n");
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
  const hasAdditionalContext = selectedTools.length > 0 || history.length > 0 || memories.length > 0 || Boolean(systemPrompt?.trim()) || Boolean(userPersona?.trim());
  if (provisional && !hasAdditionalContext) {
    for (const chunk of provisionalChunks) await onChunk?.(chunk);
    answer = provisional;
  } else {
    const generationStartedAt = performance.now();
    const finalSystemPrompt = [systemPrompt?.trim(), contextResultNote].filter(Boolean).join("\n\n") || undefined;
    answer = await generateAnswer(history, input.prompt, memories, finalSystemPrompt, userPersona, onChunk);
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
