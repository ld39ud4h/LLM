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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const targetDate = new Date(Date.UTC(year!, month! - 1, day! + dayOffset, 12));
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(targetDate);
  const [y, m, d] = dateParts.split("-").map(Number);

  const midnightUtc = (yy: number, mm: number, dd: number): Date => {
    const utcGuess = Date.UTC(yy, mm - 1, dd, 12);
    const wallParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(utcGuess));
    const value = (type: string) => Number(wallParts.find((part) => part.type === type)?.value ?? 0);
    const wallAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    const offset = wallAsUtc - utcGuess;
    return new Date(Date.UTC(yy, mm - 1, dd) - offset);
  };

  const start = midnightUtc(y!, m!, d!);
  const nextDay = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const end = midnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate());
  return { start: start.toISOString(), end: end.toISOString() };
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
