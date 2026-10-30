import { supabase } from "../clients/supabase.js";
export async function getGuildSystemPrompt(guildId:string|null):Promise<string|undefined>{
 if(!guildId)return undefined;
 const {data,error}=await supabase.from("guild_settings").select("system_prompt").eq("guild_id",guildId).maybeSingle();
 if(error)throw error;return (data?.system_prompt as string|null|undefined)??undefined;
}
export async function setGuildSystemPrompt(guildId:string,systemPrompt:string):Promise<void>{
 const {error}=await supabase.from("guild_settings").upsert({guild_id:guildId,system_prompt:systemPrompt,updated_at:new Date().toISOString()},{onConflict:"guild_id"});if(error)throw error;
}
