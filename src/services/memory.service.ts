import { supabase } from "../clients/supabase.js";
import { cacheDelete, cacheList, cacheSet, isCacheHydrated } from "./cache.service.js";

export async function listMemories(discordUserId: string): Promise<string[]> {
  if (isCacheHydrated("user_memories")) {
    return cacheList("user_memories").filter((row) => row.discord_user_id === discordUserId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((row) => String(row.content));
  }
  const { data, error } = await supabase.from("user_memories").select("id,discord_user_id,content,created_at").eq("discord_user_id", discordUserId).order("created_at", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) cacheSet("user_memories", String(row.id), row);
  return (data ?? []).map((row) => row.content as string);
}

export async function remember(discordUserId: string, content: string): Promise<void> {
  const { data, error } = await supabase.from("user_memories").insert({ discord_user_id: discordUserId, content }).select("id,discord_user_id,content,created_at").single();
  if (error) throw error;
  cacheSet("user_memories", String(data.id), data);
}

export async function forgetMemories(discordUserId: string): Promise<void> {
  const { error } = await supabase.from("user_memories").delete().eq("discord_user_id", discordUserId);
  if (error) throw error;
  for (const row of cacheList("user_memories")) if (row.discord_user_id === discordUserId) cacheDelete("user_memories", String(row.id));
}
