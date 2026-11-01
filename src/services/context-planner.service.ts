import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { listLocalTools } from "./tools/index.js";

export type ContextToolName =
  | "get_recent_history"
  | "get_yesterday_history"
  | "get_user_memories"
  | "get_guild_settings"
  | "get_user_persona"
  | "fuso_horario"
  | "data_hora"
  | "conversao_unidades"
  | "calculadora"
  | "porcentagem"
  | "conversao_temperatura"
  | "diferenca_datas"
  | "timestamp";

const declarations = [
  { name: "get_recent_history", description: "Recupera as mensagens recentes da conversa atual. Use somente quando a pergunta depender de algo dito anteriormente.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_yesterday_history", description: "Recupera somente as mensagens da conversa atual ocorridas ontem no fuso do bot. Use quando a pessoa disser ontem.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_user_memories", description: "Recupera memórias persistentes explicitamente salvas sobre esta pessoa.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_guild_settings", description: "Recupera instruções personalizadas do servidor Discord atual, somente se forem relevantes.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_user_persona", description: "Recupera a personalidade e estilo configurados pela pessoa, somente se forem relevantes.", parameters: { type: "OBJECT", properties: {} } },
] as const;

const localDeclarations = listLocalTools().filter((tool) => tool.name !== "conversa_casual").map((tool) => ({ name: tool.name, description: tool.description, parameters: { type: "OBJECT", properties: {} } }));
const allDeclarations = [...declarations, ...localDeclarations];
const allowed = new Set<string>(allDeclarations.map((item) => item.name));

function parseGeminiCalls(payload: any): ContextToolName[] {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const selected: ContextToolName[] = [];
  for (const part of parts as Array<{ functionCall?: { name?: string } }>) {
    const name = part.functionCall?.name;
    if (name && allowed.has(name) && !selected.includes(name as ContextToolName)) selected.push(name as ContextToolName);
  }
  return selected;
}

function parseOpenRouterCalls(payload: any): ContextToolName[] {
  const calls = payload?.choices?.[0]?.message?.tool_calls ?? [];
  const selected: ContextToolName[] = [];
  for (const call of calls as Array<{ function?: { name?: string } }>) {
    const name = call.function?.name;
    if (name && allowed.has(name) && !selected.includes(name as ContextToolName)) selected.push(name as ContextToolName);
  }
  return selected;
}

async function planWithGemini(prompt: string): Promise<ContextToolName[]> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: [
        "Você é um seletor de ferramentas para um assistente do Discord.",
        "Decida autonomamente se algum contexto persistente é realmente necessário para responder.",
        "Não escolha ferramentas por palavras isoladas; considere a intenção e a dependência de informação pessoal anterior.",
        "Cumprimentos, perguntas gerais e conhecimento estável normalmente não exigem ferramentas.",
        "Se a pessoa disser ontem, escolha apenas get_yesterday_history, nunca get_recent_history.",
        "Referência a conversas anteriores usa get_recent_history. Memória pessoal salva usa get_user_memories.",
        "Configurações/persona somente quando relevantes. Chamadas independentes podem ser selecionadas juntas.",
        "Ferramentas locais podem calcular, converter unidades/temperaturas, obter data e hora e calcular diferenças de datas. Escolha-as somente quando a operação for pedida e os dados forem suficientes. Use o menor conjunto de ferramentas. Não invente ferramentas ou argumentos."
      ].join("\n") }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ functionDeclarations: allDeclarations }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error("Gemini context planner HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
  return parseGeminiCalls(await response.json());
}

async function planWithOpenRouter(prompt: string): Promise<ContextToolName[]> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + env.OPENROUTER_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      temperature: 0,
      tool_choice: "auto",
      parallel_tool_calls: true,
      tools: allDeclarations.map((item) => ({
        type: "function",
        function: {
          name: item.name,
          description: item.description,
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      })),
      messages: [
        { role: "system", content: "Selecione zero ou mais ferramentas de contexto somente se necessárias. 'ontem' exige get_yesterday_history e não get_recent_history. Conversas anteriores: get_recent_history. Memória pessoal salva: get_user_memories. Configurações/persona somente quando relevantes. Chamadas independentes podem ser paralelas. Use ferramentas locais para cálculos/conversões/datas quando necessário. Não invente dados." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error("OpenRouter context planner HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
  return parseOpenRouterCalls(await response.json());
}

function conservativeFallback(prompt: string): ContextToolName[] {
  const normalized = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const selected: ContextToolName[] = [];
  if (/\b(ontem|conversa de ontem|mensagens de ontem|o que falamos ontem)\b/.test(normalized)) {
    selected.push("get_yesterday_history");
  } else if (/\b(lembra|recorda|conversamos|falamos|discutimos|assunto que|aquela conversa|outra conversa|da outra vez|anteriormente|historico|mensagens anteriores)\b/.test(normalized)) {
    selected.push("get_recent_history");
  }
  if (/\b(minha memoria|o que voce lembra|lembra de mim|lembra que|recorda que|salvei|te pedi para lembrar)\b/.test(normalized)) {
    selected.push("get_user_memories");
  }
  return selected;
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
      const fallback = conservativeFallback(prompt);
      logger.error({ err: openRouterError, feature: "context-tool-planner", fallback }, "All context planners failed; applying conservative recall-only fallback");
      return fallback;
    }
  }
}
