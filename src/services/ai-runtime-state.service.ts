import { supabase } from "../clients/supabase.js";
import { logger } from "../config/logger.js";
import { cacheGet, cacheSet } from "./cache.service.js";

export type ActiveAIProvider = "gemini" | "openrouter";
export interface ActiveAIModel { provider: ActiveAIProvider; model: string; }
export interface AIModelCandidate extends ActiveAIModel { retryAfter?: string; }

interface AIProviderState { active?: ActiveAIModel; availableModels: AIModelCandidate[]; }
let cachedState: AIProviderState | undefined;

function parseCandidates(value: unknown): AIModelCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AIModelCandidate =>
    Boolean(item && typeof item === "object"
      && ((item as AIModelCandidate).provider === "gemini" || (item as AIModelCandidate).provider === "openrouter")
      && typeof (item as AIModelCandidate).model === "string"
      && (item as AIModelCandidate).model.length > 0),
  );
}

export async function getAIProviderState(): Promise<AIProviderState> {
  if (cachedState) return cachedState;
  const local = cacheGet("ai_runtime_state", "global");
  if (local?.active_provider && local?.active_model) {
    cachedState = {
      active: { provider: local.active_provider as ActiveAIProvider, model: String(local.active_model) },
      availableModels: parseCandidates(local.available_models),
    };
    return cachedState;
  }
  try {
    const { data, error } = await supabase.from("ai_runtime_state")
      .select("state_key,active_provider,active_model,available_models,updated_at")
      .eq("state_key", "global").maybeSingle();
    if (error) throw error;
    if (data) {
      cachedState = {
        active: data.active_provider && data.active_model
          ? { provider: data.active_provider as ActiveAIProvider, model: data.active_model as string }
          : undefined,
        availableModels: parseCandidates(data.available_models),
      };
      cacheSet("ai_runtime_state", "global", data);
    }
  } catch (error) {
    logger.warn({ err: error, feature: "ai-fallback-state" }, "Could not load persisted AI provider state");
  }
  return cachedState ?? { availableModels: [] };
}

export async function getActiveAIModel(): Promise<ActiveAIModel | undefined> {
  return (await getAIProviderState()).active;
}

export async function getAvailableAIModels(): Promise<AIModelCandidate[]> {
  return (await getAIProviderState()).availableModels;
}

export async function setAIProviderState(active: ActiveAIModel, availableModels: AIModelCandidate[]): Promise<void> {
  const deduped = [...new Map(availableModels.map((candidate) => [
    candidate.provider + ":" + candidate.model, candidate,
  ])).values()];
  cachedState = { active, availableModels: deduped };
  const row = {
    state_key: "global",
    active_provider: active.provider,
    active_model: active.model,
    available_models: deduped,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from("ai_runtime_state").upsert(row, { onConflict: "state_key" });
    if (error) throw error;
    cacheSet("ai_runtime_state", "global", row);
    logger.info({ feature: "ai-fallback-state", provider: active.provider, model: active.model, availableModelCount: deduped.length }, "Active AI model and fallback catalog persisted");
  } catch (error) {
    logger.error({ err: error, feature: "ai-fallback-state", provider: active.provider, model: active.model }, "Could not persist AI provider state; in-memory state remains active");
  }
}

export async function setActiveAIModel(state: ActiveAIModel): Promise<void> {
  const current = await getAIProviderState();
  const candidates = current.availableModels.map((candidate) =>
    candidate.provider === state.provider && candidate.model === state.model
      ? { provider: candidate.provider, model: candidate.model }
      : candidate,
  );
  await setAIProviderState(state, candidates);
}

export async function markAIModelUnavailable(state: ActiveAIModel, cooldownMs = 5 * 60 * 1000): Promise<void> {
  const current = await getAIProviderState();
  const retryAfter = new Date(Date.now() + cooldownMs).toISOString();
  const found = current.availableModels.some((candidate) => candidate.provider === state.provider && candidate.model === state.model);
  const candidates = found
    ? current.availableModels.map((candidate) =>
        candidate.provider === state.provider && candidate.model === state.model
          ? { provider: candidate.provider, model: candidate.model, retryAfter }
          : candidate,
      )
    : [...current.availableModels, { ...state, retryAfter }];
  if (current.active) await setAIProviderState(current.active, candidates);
}
