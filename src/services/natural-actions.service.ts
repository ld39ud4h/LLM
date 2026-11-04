import { remember } from "./memory.service.js";
import { executeCommandTools } from "./command-tools.service.js";
export type NaturalAction = { kind: "memory_saved" | "command"; detail: string; result?: string };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function extractItems(text: string): string[] {
 const source=text.replace(/\r/g,"").trim();if(!source)return [];
 const lines=source.split("\n"),chunks:string[]=[];let current:string[]=[];
 const heading=/^(?:#{1,6}\s+|(?:receita|item|parte|produto|opcao|exemplo|tarefa|comando)\s*(?:n(?:º|o)?\s*)?\d*\s*[:—–-]|\d+[.)]\s+)/i;
 const bullet=/^[-*•]\s+/;
 for(const line of lines){if(heading.test(line.trim())&&current.some(v=>v.trim())){chunks.push(current.join("\n").trim());current=[];}
 if(bullet.test(line)&&current.some(v=>v.trim())&&current.every(v=>!bullet.test(v.trim()))){chunks.push(current.join("\n").trim());current=[];}current.push(line);}
 if(current.some(v=>v.trim()))chunks.push(current.join("\n").trim());return chunks.filter(Boolean);
}
function extractSaveTargets(prompt:string):string[]{
 const text=normalize(prompt);const m=/\b(salve|salvar|guarde|guardar|memorize|memorizar|registre|registrar)\b[\s\S]{0,100}\b(memoria|lembranca|lembrar)\b/.exec(text);if(!m)return [];
 const before=prompt.slice(0,m.index),after=prompt.slice(m.index+m[0].length);
 const prior=extractItems(before).at(-1),next=extractItems(after).at(0);
 const instruction=normalize(prompt.slice(m.index,m.index+m[0].length+100));
 const selected=[/\b(esta|esse|essa|anterior|acima|precedente)\b/.test(instruction)?prior:undefined,/\b(seguinte|proxima|proximo|outra|tambem|ambas|as duas)\b/.test(instruction)?next:undefined].filter((v):v is string=>Boolean(v));
 return selected.length?[...new Set(selected)].map(v=>v.slice(0,8000)):[prompt.trim().slice(0,8000)];
}
export async function executeExplicitActions(prompt:string,userId:string):Promise<NaturalAction[]>{
 const actions:NaturalAction[]=[];const targets=extractSaveTargets(prompt);
 if(targets.length){for(const item of targets)await remember(userId,item);actions.push({kind:"memory_saved",detail:targets.length===1?"1 item foi extraído e salvo na memória.":targets.length+" itens foram extraídos e salvos separadamente na memória."});}
 const results=await executeCommandTools(prompt,userId);actions.push(...results.map(r=>({kind:"command" as const,detail:r.summary,result:r.output})));return actions;
}