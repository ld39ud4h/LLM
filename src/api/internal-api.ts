import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { auditEvent, claimTicket, closeTicket, listTickets, voteSuggestion } from "../services/guild-data.service.js";
const send=(res:ServerResponse,status:number,payload:unknown)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8"});res.end(JSON.stringify(payload));};
async function body(req:IncomingMessage){let raw="";for await(const chunk of req){raw+=chunk.toString();if(raw.length>32_000)throw new Error("Payload too large");}return raw?JSON.parse(raw):{};}
function authorized(req:IncomingMessage){const secret=env.BOT_API_SECRET;if(!secret)return false;const token=req.headers.authorization?.replace(/^Bearer\s+/i,"")??"";const a=Buffer.from(secret),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}
export async function handleInternalApi(req:IncomingMessage,res:ServerResponse):Promise<boolean>{
 const path=(req.url??"").split("?")[0];if(!path?.startsWith("/api/v1/"))return false;
 if(!authorized(req)){send(res,401,{error:"unauthorized"});return true;}
 try{
  if(req.method==="GET"&&path==="/api/v1/tickets"){const u=new URL(req.url??"/","http://localhost");const guildId=u.searchParams.get("guildId");if(!guildId){send(res,400,{error:"guildId required"});return true;}send(res,200,{ok:true,tickets:await listTickets(guildId,u.searchParams.get("status")??undefined)});return true;}
  if(req.method==="POST"&&path==="/api/v1/tickets/claim"){const b=await body(req);if(!b.channelId||!b.actorId){send(res,400,{error:"channelId and actorId required"});return true;}send(res,200,{ok:true,ticket:await claimTicket(String(b.channelId),String(b.actorId))});return true;}
  if(req.method==="POST"&&path==="/api/v1/tickets/close"){const b=await body(req);if(!b.channelId||!b.actorId){send(res,400,{error:"channelId and actorId required"});return true;}send(res,200,{ok:true,ticket:await closeTicket(String(b.channelId),String(b.actorId))});return true;}
  if(req.method==="POST"&&path==="/api/v1/suggestions/vote"){const b=await body(req);if(!b.suggestionId||!b.userId||![1,-1].includes(Number(b.vote))){send(res,400,{error:"suggestionId, userId and vote (+1|-1) required"});return true;}await voteSuggestion(String(b.suggestionId),String(b.userId),Number(b.vote) as 1|-1);send(res,200,{ok:true});return true;}
  if(req.method==="POST"&&path==="/api/v1/audit"){const b=await body(req);if(!b.eventType){send(res,400,{error:"eventType required"});return true;}await auditEvent({guildId:b.guildId,actorId:b.actorId,eventType:String(b.eventType),targetId:b.targetId,metadata:b.metadata});send(res,201,{ok:true});return true;}
  send(res,404,{error:"route_not_found"});return true;
 }catch(e){send(res,500,{error:"internal_error",message:e instanceof Error?e.message:"unknown"});return true;}
}
