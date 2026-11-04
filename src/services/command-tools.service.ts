import { listLocalTools } from "./tools/index.js";
import { listMemories, remember } from "./memory.service.js";
import { commands } from "../commands/index.js";

export type CommandToolResult = { name: string; summary: string; output: string };
type CommandTool = { name: string; description: string; matches: (text: string) => boolean; run: (text: string, userId: string) => Promise<string> | string };
const norm = (s: string) => s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim();

const registry: CommandTool[] = [
 {name:"memory.save",description:"Salva conteúdo explicitamente solicitado na memória pessoal",matches:t=>/\\b(salve|salvar|guarde|memorize|registre)\\b/.test(t)&&/\\b(memoria|lembranca)\\b/.test(t),run:async(t,userId)=>{await remember(userId,t.slice(0,8000));return "Conteúdo salvo na memória."}},
 {name:"memory.list",description:"Lista memórias pessoais",matches:t=>/\\b(minhas memorias|listar memorias|mostre minhas memorias|o que esta salvo na memoria)\\b/.test(t),run:async(_t,userId)=>{const rows=await listMemories(userId);return rows.length?rows.map((v,i)=>`${i+1}. ${v}`).join("\\n"):"Nenhuma memória encontrada."}},
 {name:"commands.list",description:"Lista comandos Slash disponíveis",matches:t=>/\\b(liste|listar|mostre|mostrar|exiba|quais|todos)\\b/.test(t)&&/\\b(comandos?|slash commands?)\\b/.test(t),run:()=>commands.map(c=>"/"+c.data.name+" — "+c.data.description).join("\\n")},
 {name:"tools.list",description:"Lista ferramentas de cálculo e utilidades",matches:t=>/\\b(ferramentas|utilidades|calculadora|conversoes disponiveis)\\b/.test(t),run:()=>listLocalTools().map(x=>x.name+" — "+x.description).join("\\n")},
 {name:"panel.ticket",description:"Orientação para abrir ticket",matches:t=>/\\b(abrir|criar|quero|preciso)\\b[\\s\\S]{0,35}\\bticket\\b/.test(t),run:()=>"Abra o painel Tickets e clique em Abrir ticket; o formulário cria um canal privado."},
 {name:"panel.suggestion",description:"Orientação para enviar sugestão",matches:t=>/\\b(enviar|fazer|registrar)\\b[\\s\\S]{0,35}\\bsugestao\\b/.test(t),run:()=>"No painel Sugestões, clique em Enviar sugestão e preencha o formulário."},
 {name:"panel.support",description:"Orientação para solicitar atendimento",matches:t=>/\\b(abrir|solicitar|preciso|quero)\\b[\\s\\S]{0,35}\\b(atendimento|suporte)\\b/.test(t),run:()=>"No painel Suporte, clique em Solicitar atendimento e descreva o caso."},
];
export function listCommandTools(){return registry.map(({name,description})=>({name,description}));}
export async function executeCommandTools(prompt:string,userId:string):Promise<CommandToolResult[]>{
 const text=norm(prompt); const results:CommandToolResult[]=[];
 for(const tool of registry){if(!tool.matches(text))continue;try{results.push({name:tool.name,summary:tool.description,output:await tool.run(text,userId)});}catch{results.push({name:tool.name,summary:tool.description,output:"A ferramenta não conseguiu concluir a ação."});}}
 return results;
}
