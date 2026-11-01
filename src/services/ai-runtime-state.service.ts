import { supabase } from "../clients/supabase.js";
import { logger } from "../config/logger.js";

export type ActiveAIProvider = "gemini" | "openrouter";
export interface ActiveAIModel { provider: ActiveAIProvider; model: string; }

let cachedState: ActiveAIModel | undefined;

export async function getActiveAIModel(): Promise<ActiveAIModel | undefined> {
  if (cachedState) return cachedState;
  try {
    const { data, error } = await supabase
      .from("ai_runtime_state")
      .select("active_provider,active_model")
      .eq("state_key", "global")
      .maybeSingle();
    if (error) throw error;
    if (data?.active_provider && data?.active_model) {
      cachedState = { provider: data.active_provider as ActiveAIProvider, model: data.active_model as string };
    }
  } catch (error) {
    logger.warn({ err: error, feature: "ai-fallback-state" }, "Could not load persisted active AI model; using discovery order");
  }
  return cachedState;
}

export async function setActiveAIModel(state: ActiveAIModel): Promise<void> {
  cachedState = state;
  try {
    const { error } = await supabase.from("ai_runtime_state").upsert({
      state_key: "global",
      active_provider: state.provider,
      active_model: state.model,
      updated_at: new Date().toISOString(),
    }, { onConflict: "state_key" });
    if (error) throw error;
    logger.info({ feature: "ai-fallback-state", provider: state.provider, model: state.model }, "Active AI model persisted");
  } catch (error) {
    logger.error({ err: error, feature: "ai-fallback-state", provider: state.provider, model: state.model }, "Could not persist active AI model; in-memory selection remains active");
  }
}
