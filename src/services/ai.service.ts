import { gemini, GEMINI_MODEL } from "../clients/gemini.js";
import type { ChatTurn } from "./conversation.service.js";
const SYSTEM_INSTRUCTION="Você é um assistente útil, claro e respeitoso dentro do Discord. Responda no idioma utilizado pela pessoa. Se não souber algo, admita a incerteza; não invente fatos ou fontes.";
export async function generateAnswer(history:ChatTurn[],prompt:string):Promise<string>{
 const contents=[...history.map(turn=>({role:turn.role,parts:[{text:turn.text}]})),{role:"user" as const,parts:[{text:prompt}]}];
 const response=await gemini.models.generateContent({model:GEMINI_MODEL,contents,config:{systemInstruction:SYSTEM_INSTRUCTION,temperature:0.7}});
 const answer=response.text?.trim();if(!answer)throw new Error("Gemini returned an empty response");return answer;
}
