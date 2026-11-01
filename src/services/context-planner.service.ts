import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export type ContextToolName = "get_recent_history" | "get_yesterday_history" | "get_user_memories" | "get_guild_settings" | "get_user_persona";

const declarations = [
  { name: "get_recent_history", description: "Recupera as mensagens recentes da conversa atual. Use somente quando a pergunta depender de algo dito anteriormente.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_yesterday_history", description: "Recupera somente as mensagens da conversa atual ocorridas ontem no fuso do bot. Prefira esta ferramenta quando a pessoa disser ontem.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_user_memories", description: "Recupera memórias persistentes explicitamente salvas sobre esta pessoa. Use quando ela perguntar o que você lembra dela ou fizer referência a uma preferência/fato salvo.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_guild_settings", description: "Recupera instruções personalizadas do servidor Discord atual. Use apenas se forem relevantes para responder.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_user_persona", description: "Recupera a personalidade e estilo de resposta configurados pela pessoa. Use apenas se forem relevantes para a resposta.", parameters: { type: "OBJECT", properties: {} } },
] as const;

const allowed = new Set<string>(declarations.map((item) => item.name));

function parseGeminiCalls(payload: any): ContextToolName[] {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return [...new Set(parts.filter((part: any) => part.functionCall?.name && allowed.has(part.functionCall.name)).map((part: any) => part.functionCall.name as ContextToolName))];
}

function parseOpenRouterCalls(payload: any): ContextToolName[] {
  const calls = payload?.choices?.[0]?.message?.tool_calls ?? [];
  return [...new Set(calls.filter((call: any) => allowed.has(call.function?.name)).map((call: any) => call.function.name as ContextToolName))];
}

async function planWithGemini(prompt: string): Promise<ContextToolName[]> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: [
        "Você é um seletor de ferramentas para um assistente do Discord.",
        "Decida autonomamente se algum contexto persistente é realmente necessário para responder à mensagem.",
        "Não escolha ferramentas por palavras isoladas; considere a intenção e a dependência de informação pessoal anterior.",
        "Cumprimentos, perguntas gerais e conhecimento estável normalmente não precisam de ferramentas.",
        "Se a pessoa disser ontem, escolha apenas get_yesterday_history, não get_recent_history.",
        "Se perguntar por conversas anteriores, escolha get_recent_history. Se pedir algo que lembra/salvou, escolha get_user_memories.",
        "Escolha configurações/persona somente quando forem relevantes. Ferramentas independentes podem ser chamadas juntas.",
        "Use o menor conjunto de ferramentas. Nunca invente chamadas ou argumentos."
      ].join("\n") }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ functionDeclarations: declarations }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error("Gemini context planner HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
  return parseGeminiCalls(await response.json());
}

async function planWithOpenRouter(prompt: string): Promise<ContextToolName[]> {
  if (!env.OPENROUTER_API_KEY) return [];
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + env.OPENROUTER_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      temperature: 0,
      tool_choice: "auto",
      parallel_tool_calls: true,
      tools: declarations.map((item) => ({ type: "function", function: { name: item.name, description: item.description, parameters: { type: "object", properties: {}, additionalProperties: false } } })),
      messages: [
        { role: "system", content: "Você seleciona ferramentas de contexto para um assistente. Escolha zero ou mais ferramentas somente se necessárias. 'ontem' exige get_yesterday_history e não get_recent_history. Referência a conversas anteriores usa get_recent_history. Memória pessoal salva usa get_user_memories. Configurações/persona só quando relevantes. Chamadas independentes devem ser paralelas. Não invente dados." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error("OpenRouter context planner HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
  return parseOpenRouterCalls(await response.json());
}

export async function planContextTools(prompt: string): Promise<ContextToolName[]> {
  try {
    const selected = await planWithGemini(prompt);
    logger.info({ feature: "context-tool-planner", provider: "gemini", selected }, "Model selected context tools");
    return selected;
  } catch (geminiError) {
    logger.warn({ err: geminiError, feature: "context-tool-planner" }, "Gemini context planning failed; trying OpenRouter");
    try {
      const selected = await planWithOpenRouter(prompt);
      logger.info({ feature: "context-tool-planner", provider: "openrouter", selected }, "Model selected context tools");
      return selected;
    } catch (openRouterError) {
      logger.error({ err: openRouterError, feature: "context-tool-planner" }, "All context planners failed; using conservative no-context fallback");
      return [];
    }
  }
}
