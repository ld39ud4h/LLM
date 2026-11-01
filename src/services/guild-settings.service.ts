import { supabase } from "../clients/supabase.js";
import { cacheGet, cacheSet } from "./cache.service.js";

export async function getGuildSystemPrompt(guildId: string | null): Promise<string | undefined> {
  if (!guildId) return undefined;
  const cached = cacheGet("guild_settings", guildId);
  if (cached) return (cached.system_prompt as string | null | undefined) ?? undefined;
  const { data, error } = await supabase.from("guild_settings").select("guild_id,system_prompt,updated_at").eq("guild_id", guildId).maybeSingle();
  if (error) throw error;
  if (data) cacheSet("guild_settings", guildId, data);
  return (data?.system_prompt as string | null | undefined) ?? undefined;
}

export async function setGuildSystemPrompt(guildId: string, systemPrompt: string): Promise<void> {
  const row = { guild_id: guildId, system_prompt: systemPrompt, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("guild_settings").upsert(row, { onConflict: "guild_id" });
  if (error) throw error;
  cacheSet("guild_settings", guildId, row);
}
