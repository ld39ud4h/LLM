import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { getAIProviderState, setAIProviderState, type ActiveAIModel } from "./ai-runtime-state.service.js";

interface GeminiModel { name?: string; baseModelId?: string; supportedGenerationMethods?: string[]; }
interface OpenRouterModel { id?: string; created?: number; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { output_modalities?: string[] }; }

const PROBE_TIMEOUT_MS = 3500;
const PROBE_PROMPT = "Responda apenas: OK";

async function listGeminiModels(): Promise<string[]> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
    headers: { "x-goog-api-key": env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Gemini catalog HTTP " + response.status);
  const payload = await response.json() as { models?: GeminiModel[] };
  const ids = (payload.models ?? [])
    .filter((item) => item.supportedGenerationMethods?.includes("generateContent"))
    .map((item) => (item.baseModelId || item.name?.replace(/^models\//, "") || "").trim())
    .filter((id) => /^gemini-\d+\.\d+/i.test(id));
  const version = (id: string) => { const m = id.match(/^gemini-(\d+)\.(\d+)/i); return m ? [Number(m[1]), Number(m[2])] : [0,0]; };
  const rank = (id: string) => /flash-lite/i.test(id) ? 1 : /flash/i.test(id) ? 0 : /pro/i.test(id) ? 2 : 3;
  return [...new Set([env.GEMINI_MODEL, ...ids].filter(Boolean))].sort((a,b) => {
    const av=version(a), bv=version(b); return (bv[0] ?? 0)-(av[0] ?? 0) || (bv[1] ?? 0)-(av[1] ?? 0) || rank(a)-rank(b);
  }).slice(0,3);
}

async function listOpenRouterModels(): Promise<string[]> {
  if (!env.OPENROUTER_API_KEY) return [];
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: "Bearer " + env.OPENROUTER_API_KEY },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("OpenRouter catalog HTTP " + response.status);
  const payload = await response.json() as { data?: OpenRouterModel[] };
  const eligible = (payload.data ?? []).filter((model) => {
    const id = model.id ?? "";
    return id.endsWith(":free")
      && Number(model.pricing?.prompt) === 0
      && Number(model.pricing?.completion) === 0
      && (!model.architecture?.output_modalities?.length || model.architecture.output_modalities.includes("text"));
  });
  // Prefer models with larger context windows, then the most recently published.
  eligible.sort((left, right) =>
    Number(right.context_length ?? 0) - Number(left.context_length ?? 0)
    || Number(right.created ?? 0) - Number(left.created ?? 0),
  );
  return [...new Set(eligible.map((model) => model.id).filter((id): id is string => Boolean(id)))].slice(0, 8);
}

async function probeGemini(model: string): Promise<boolean> {
  try {
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
      method:"POST",
      headers:{"content-type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:PROBE_PROMPT}]}],generationConfig:{temperature:0,maxOutputTokens:2}}),
      signal:AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if(!response.ok) return false;
    const payload=await response.json() as any;
    return Boolean(payload.candidates?.[0]?.content?.parts?.some((part: { text?: string })=>part.text?.trim()));
  } catch { return false; }
}

async function probeOpenRouter(model: string): Promise<boolean> {
  if(!env.OPENROUTER_API_KEY) return false;
  try {
    const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{Authorization:"Bearer "+env.OPENROUTER_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model,stream:false,temperature:0,max_tokens:2,messages:[{role:"user",content:PROBE_PROMPT}]}),
      signal:AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if(!response.ok) return false;
    const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>};
    return Boolean(payload.choices?.[0]?.message?.content?.trim());
  } catch { return false; }
}

async function runAIProviderBootstrap(forceRefresh: boolean): Promise<{ selected: ActiveAIModel; healthyModels: ActiveAIModel[]; tested: number }> {
  const persisted = await getAIProviderState();
  const saved = persisted.active;
  if (!forceRefresh && saved?.provider && saved.model && persisted.availableModels.length > 0) {
    logger.info({ feature: "ai-bootstrap", provider: saved.provider, model: saved.model }, "Persisted AI model found; skipping provider discovery and startup probes");
    return { selected: saved, healthyModels: persisted.availableModels, tested: 0 };
  }

  logger.info({ feature: "ai-bootstrap", forceRefresh }, "Discovering and probing current provider catalogs");
  const [geminiResult, openRouterResult] = await Promise.all([
    listGeminiModels().then((models) => ({ models, ok: true as const })).catch((error) => {
      logger.warn({ err: error, feature: "ai-bootstrap", provider: "gemini" }, "Gemini model catalog unavailable");
      return { models: [] as string[], ok: false as const };
    }),
    listOpenRouterModels().then((models) => ({ models, ok: true as const })).catch((error) => {
      logger.warn({ err: error, feature: "ai-bootstrap", provider: "openrouter" }, "OpenRouter model catalog unavailable");
      return { models: [] as string[], ok: false as const };
    }),
  ]);

  const candidates: ActiveAIModel[] = [
    ...(saved ? [saved] : []),
    ...geminiResult.models.map((model) => ({ provider: "gemini" as const, model })),
    ...openRouterResult.models.map((model) => ({ provider: "openrouter" as const, model })),
    ...(!geminiResult.ok ? persisted.availableModels.filter((item) => item.provider === "gemini") : []),
    ...(!openRouterResult.ok ? persisted.availableModels.filter((item) => item.provider === "openrouter") : []),
  ];
  const uniqueCandidates = [...new Map(candidates.map((item) => [item.provider + ":" + item.model, item])).values()];
  const results = await Promise.all(uniqueCandidates.map(async (candidate) => ({
    candidate,
    healthy: candidate.provider === "gemini" ? await probeGemini(candidate.model) : await probeOpenRouter(candidate.model),
  })));
  const healthy = results.filter((result) => result.healthy).map((result) => result.candidate);
  const previousStillHealthy = saved && healthy.find((item) => item.provider === saved.provider && item.model === saved.model);
  const selected = previousStillHealthy
    ?? healthy.find((item) => item.provider === "gemini")
    ?? healthy[0];

  if (!selected) {
    logger.error({ feature: "ai-bootstrap", testedModels: results.length }, "No AI model passed the scheduled probe; keeping the last persisted state");
    throw new Error("No AI model passed the bootstrap probe");
  }

  await setAIProviderState(selected, healthy);
  logger.info({
    feature: "ai-bootstrap", selectedProvider: selected.provider, selectedModel: selected.model,
    testedModels: results.length, healthyModels: healthy.length, previousModelRetained: Boolean(previousStillHealthy),
    probeTimeoutMs: PROBE_TIMEOUT_MS,
  }, "AI model catalog refreshed and persisted");
  return { selected, healthyModels: healthy, tested: results.length };
}

export async function initializeAIProvider(): Promise<void> {
  await runAIProviderBootstrap(false);
}

export async function refreshAIProviderCatalog(): Promise<{ selected: ActiveAIModel; healthyModels: ActiveAIModel[]; tested: number }> {
  return runAIProviderBootstrap(true);
}
