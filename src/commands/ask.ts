import { SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { replyToUser } from "../services/chat.service.js";import { logger } from "../config/logger.js";
export const askCommand={
 data:new SlashCommandBuilder().setName("ask").setDescription("Converse com a inteligência artificial").addStringOption(option=>option.setName("mensagem").setDescription("O que você quer perguntar?").setRequired(true).setMaxLength(4000)),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  const prompt=interaction.options.getString("mensagem",true).trim();await interaction.deferReply();
  try{
   const answer=await replyToUser({discordUserId:interaction.user.id,username:interaction.user.username,channelId:interaction.channelId,guildId:interaction.guildId,prompt});
   const chunks=answer.match(/[\s\S]{1,1900}/g)??[answer];await interaction.editReply(chunks[0]??"Não consegui gerar uma resposta.");for(const chunk of chunks.slice(1))await interaction.followUp({content:chunk});
  }catch(error){logger.error({error,userId:interaction.user.id},"Failed to handle /ask");await interaction.editReply("Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.");}
 }
};
