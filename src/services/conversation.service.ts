import { supabase } from "../clients/supabase.js";
import { env } from "../config/env.js";
export type ChatRole = "user" | "model";
export interface ChatTurn { role: ChatRole; text: string }

export async function getOrCreateConversation(discordUserId: string, username: string, channelId: string): Promise<string> {
  const { error: userError } = await supabase.from("discord_users").upsert({ discord_id: discordUserId, username, updated_at: new Date().toISOString() }, { onConflict: "discord_id" });
  if (userError) throw userError;
  const { data: existing, error: findError } = await supabase.from("conversations").select("id").eq("discord_user_id", discordUserId).eq("channel_id", channelId).maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id as string;
  const { data, error } = await supabase.from("conversations").insert({ discord_user_id: discordUserId, channel_id: channelId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function localDayBounds(dayOffset: number): { start: string; end: string } {
  const timezone = env.BOT_TIMEZONE;
  const now = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, day] = localDate.split("-").map(Number);
  const localMidday = new Date(Date.UTC(year!, month! - 1, day! + dayOffset, 12));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(localMidday);
  const [y, m, d] = date.split("-").map(Number);
  // Convert local midnight boundaries to UTC using the configured timezone offset at that date.
  const toUtc = (hour: number) => {
    const target = new Date(Date.UTC(y!, m! - 1, d!, hour));
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(target);
    const hh = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const mm = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const offsetMinutes = hh * 60 + mm - hour * 60;
    return new Date(target.getTime() - offsetMinutes * 60_000).toISOString();
  };
  return { start: toUtc(0), end: toUtc(24) };
}

async function queryHistory(conversationId: string, start?: string, end?: string): Promise<ChatTurn[]> {
  let query = supabase.from("messages").select("role,content,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false });
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  if (!start) query = query.limit(env.BOT_MAX_HISTORY);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse().map((row) => ({ role: row.role as ChatRole, text: row.content as string }));
}

export async function getHistory(conversationId: string): Promise<ChatTurn[]> {
  return queryHistory(conversationId);
}

export async function getHistoryForDate(conversationId: string, day: "yesterday"): Promise<ChatTurn[]> {
  const bounds = localDayBounds(day === "yesterday" ? -1 : 0);
  return queryHistory(conversationId, bounds.start, bounds.end);
}

export async function saveMessage(conversationId: string, role: ChatRole, content: string): Promise<void> {
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) throw error;
}
