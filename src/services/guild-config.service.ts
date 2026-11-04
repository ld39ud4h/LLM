import { supabase } from "../clients/supabase.js";
import { cacheGet, cacheSet } from "./cache.service.js";
import { logger } from "../config/logger.js";

export type GuildRuntimeConfig = {
  panels?: Record<string, { channelId: string; messageId: string; customId: string; updatedAt: string }>;
  channels?: Record<string, string>;
  setup?: { channelIds?: Record<string, string>; [key: string]: unknown };
  webhooks?: Record<string, { id: string; url?: string; channelId?: string; name?: string; createdAt: string }>;
  [key: string]: unknown;
};
const COLLECTION = "lanstec_guild_config";

export async function getGuildRuntimeConfig(guildId: string): Promise<GuildRuntimeConfig> {
  const cached = cacheGet(COLLECTION, guildId);
  if (cached?.config && typeof cached.config === "object") return cached.config as GuildRuntimeConfig;
  const { data, error } = await supabase.from(COLLECTION).select("guild_id,config,revision,updated_at,updated_by").eq("guild_id", guildId).maybeSingle();
  if (error) throw error;
  const row = data ?? { guild_id: guildId, config: {}, revision: 1, updated_at: new Date().toISOString() };
  cacheSet(COLLECTION, guildId, row as Record<string, unknown>);
  return (row.config ?? {}) as GuildRuntimeConfig;
}

export async function patchGuildRuntimeConfig(guildId: string, patch: Partial<GuildRuntimeConfig>, actorId?: string): Promise<GuildRuntimeConfig> {
  const current = await getGuildRuntimeConfig(guildId);
  const next: GuildRuntimeConfig = { ...current, ...patch };
  const { data: old } = await supabase.from(COLLECTION).select("revision").eq("guild_id", guildId).maybeSingle();
  const row = { guild_id: guildId, config: next, revision: Number(old?.revision ?? 0) + 1, updated_at: new Date().toISOString(), updated_by: actorId ?? null };
  const { error } = await supabase.from(COLLECTION).upsert(row, { onConflict: "guild_id" });
  if (error) throw error;
  cacheSet(COLLECTION, guildId, row);
  logger.info({ feature: "guild-config", guildId, revision: row.revision, keys: Object.keys(patch) }, "Guild configuration persisted");
  return next;
}

export async function setGuildPanel(guildId: string, panelKey: string, value: { channelId: string; messageId: string; customId: string }): Promise<void> {
  const current = await getGuildRuntimeConfig(guildId);
  await patchGuildRuntimeConfig(guildId, { panels: { ...(current.panels ?? {}), [panelKey]: { ...value, updatedAt: new Date().toISOString() } } });
}

/** IDs operacionais centralizados; URLs/tokens secretos de webhooks não são persistidos. */
export async function setGuildChannel(guildId:string,key:string,channelId:string,actorId?:string):Promise<void>{
 const current=await getGuildRuntimeConfig(guildId);
 await patchGuildRuntimeConfig(guildId,{channels:{...((current.channels as Record<string,string>)??{}),[key]:channelId}},actorId);
}
export async function setGuildWebhook(guildId:string,key:string,value:{id:string;channelId?:string;name?:string},actorId?:string):Promise<void>{
 const current=await getGuildRuntimeConfig(guildId);
 await patchGuildRuntimeConfig(guildId,{webhooks:{...(current.webhooks??{}),[key]:{...value,createdAt:new Date().toISOString()}}},actorId);
}
export async function removeGuildWebhook(guildId:string,key:string,actorId?:string):Promise<void>{
 const current=await getGuildRuntimeConfig(guildId);const webhooks={...(current.webhooks??{})};delete webhooks[key];
 await patchGuildRuntimeConfig(guildId,{webhooks},actorId);
}
