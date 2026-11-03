import { supabase } from "../clients/supabase.js";

export type AuditEvent = { guildId?: string | null; actorId?: string | null; eventType: string; targetId?: string | null; metadata?: Record<string, unknown> };
export async function auditEvent(e: AuditEvent) {
 const { error } = await supabase.from("lanstec_audit_events").insert({guild_id:e.guildId??null,actor_id:e.actorId??null,event_type:e.eventType,target_id:e.targetId??null,metadata:e.metadata??{}});
 if(error) throw error;
}
export async function saveTicket(input:{guildId:string;channelId:string;requesterId:string;subject:string;details:string}) {
 const {data,error}=await supabase.from("lanstec_tickets").insert({guild_id:input.guildId,channel_id:input.channelId,requester_id:input.requesterId,subject:input.subject,details:input.details}).select("id").single();
 if(error) throw error; await auditEvent({guildId:input.guildId,actorId:input.requesterId,eventType:"ticket.created",targetId:input.channelId,metadata:{ticketId:data.id,subject:input.subject}}); return data.id as string;
}
export async function claimTicket(channelId:string,actorId:string) {
 const {data,error}=await supabase.from("lanstec_tickets").update({status:"claimed",claimed_by:actorId,claimed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("channel_id",channelId).in("status",["open","claimed"]).select("id,guild_id").single();
 if(error) throw error; await auditEvent({guildId:data.guild_id,actorId,eventType:"ticket.claimed",targetId:channelId}); return data;
}
export async function closeTicket(channelId:string,actorId:string) {
 const {data,error}=await supabase.from("lanstec_tickets").update({status:"closed",closed_by:actorId,closed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("channel_id",channelId).neq("status","closed").select("id,guild_id,requester_id,subject").single();
 if(error) throw error; await auditEvent({guildId:data.guild_id,actorId,eventType:"ticket.closed",targetId:channelId,metadata:{ticketId:data.id}}); return data;
}
export async function listTickets(guildId:string,status?:string) {
 let q=supabase.from("lanstec_tickets").select("id,channel_id,requester_id,subject,status,claimed_by,created_at,closed_at").eq("guild_id",guildId).order("created_at",{ascending:false}).limit(100);
 if(status) q=q.eq("status",status); const {data,error}=await q; if(error) throw error; return data;
}
export async function saveSuggestion(input:{guildId:string;messageId?:string;authorId:string;title:string;description:string}) {
 const {data,error}=await supabase.from("lanstec_suggestions").insert({guild_id:input.guildId,message_id:input.messageId??null,author_id:input.authorId,title:input.title,description:input.description}).select("id").single();
 if(error) throw error; await auditEvent({guildId:input.guildId,actorId:input.authorId,eventType:"suggestion.created",targetId:data.id}); return data.id as string;
}
export async function voteSuggestion(suggestionId:string,userId:string,vote:1|-1) {
 const {error}=await supabase.from("lanstec_suggestion_votes").upsert({suggestion_id:suggestionId,user_id:userId,vote,updated_at:new Date().toISOString()},{onConflict:"suggestion_id,user_id"}); if(error) throw error;
}
export async function saveSupport(input:{guildId:string;messageId?:string;requesterId:string;subject:string;details:string}) {
 const {data,error}=await supabase.from("lanstec_support_requests").insert({guild_id:input.guildId,message_id:input.messageId??null,requester_id:input.requesterId,subject:input.subject,details:input.details}).select("id").single();
 if(error) throw error; await auditEvent({guildId:input.guildId,actorId:input.requesterId,eventType:"support.created",targetId:data.id}); return data.id as string;
}

export async function persistTicketMessage(input:{channelId:string;messageId:string;authorId:string;authorTag:string;content:string;attachments:unknown[];createdAt:string}) {
 const {data:ticket,error:lookupError}=await supabase.from("lanstec_tickets").select("id").eq("channel_id",input.channelId).maybeSingle();
 if(lookupError)throw lookupError;if(!ticket)return;
 const {error}=await supabase.from("lanstec_ticket_messages").upsert({ticket_id:ticket.id,discord_message_id:input.messageId,author_id:input.authorId,author_tag:input.authorTag,content:input.content,attachments:input.attachments,created_at:input.createdAt},{onConflict:"discord_message_id"});
 if(error)throw error;
}
