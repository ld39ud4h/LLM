import { SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { listMemories } from "../services/memory.service.js";import { logger } from "../config/logger.js";
export const memoriesCommand={
 data:new SlashCommandBuilder().setName("memories").setDescription("Mostra as informações que você salvou na memória"),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  await interaction.deferReply({ephemeral:true});
  try{const items=await listMemories(interaction.user.id);await interaction.editReply(items.length?items.map((item,index)=>(index+1)+". "+item).join("\n").slice(0,1900):"Sua memória está vazia. Use /remember para salvar uma informação.");}
  catch(error){logger.error({error},"Could not list user memories");await interaction.editReply("Não consegui consultar sua memória agora.");}
 }
};
