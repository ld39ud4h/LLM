import { supabase } from "../clients/supabase.js";
export async function listMemories(discordUserId: string): Promise<string[]> {
 const {data,error}=await supabase.from("user_memories").select("content").eq("discord_user_id",discordUserId).order("created_at",{ascending:true});
 if(error)throw error; return (data??[]).map(row=>row.content as string);
}
export async function remember(discordUserId:string,content:string):Promise<void>{
 const {error}=await supabase.from("user_memories").insert({discord_user_id:discordUserId,content});if(error)throw error;
}
export async function forgetMemories(discordUserId:string):Promise<void>{
 const {error}=await supabase.from("user_memories").delete().eq("discord_user_id",discordUserId);if(error)throw error;
}
