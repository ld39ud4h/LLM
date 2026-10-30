import { supabase } from "../clients/supabase.js";
import { env } from "../config/env.js";
export type ChatRole="user"|"model";
export interface ChatTurn{role:ChatRole;text:string}
export async function getOrCreateConversation(discordUserId:string,username:string,channelId:string):Promise<string>{
 const {error:userError}=await supabase.from("discord_users").upsert({discord_id:discordUserId,username,updated_at:new Date().toISOString()},{onConflict:"discord_id"});if(userError)throw userError;
 const {data:existing,error:findError}=await supabase.from("conversations").select("id").eq("discord_user_id",discordUserId).eq("channel_id",channelId).maybeSingle();if(findError)throw findError;if(existing)return existing.id as string;
 const {data,error}=await supabase.from("conversations").insert({discord_user_id:discordUserId,channel_id:channelId}).select("id").single();if(error)throw error;return data.id as string;
}
export async function getHistory(conversationId:string):Promise<ChatTurn[]>{
 const {data,error}=await supabase.from("messages").select("role,content").eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(env.BOT_MAX_HISTORY);if(error)throw error;
 return (data??[]).reverse().map(row=>({role:row.role as ChatRole,text:row.content as string}));
}
export async function saveMessage(conversationId:string,role:ChatRole,content:string):Promise<void>{const {error}=await supabase.from("messages").insert({conversation_id:conversationId,role,content});if(error)throw error;}
