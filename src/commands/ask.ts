import { SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { generateAnswer } from "../services/ai.service.js";
import { getHistory,getOrCreateConversation,saveMessage } from "../services/conversation.service.js";
import { logger } from "../config/logger.js";
export const askCommand={
 data:new SlashCommandBuilder().setName("ask").setDescription("Converse com a inteligência artificial").addStringOption(option=>option.setName("mensagem").setDescription("O que você quer perguntar?").setRequired(true)),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  const prompt=interaction.options.getString("mensagem",true).trim();await interaction.deferReply();
  try{
   const conversationId=await getOrCreateConversation(interaction.user.id,interaction.user.username,interaction.channelId);
   const history=await getHistory(conversationId);const answer=await generateAnswer(history,prompt);
   await saveMessage(conversationId,"user",prompt);await saveMessage(conversationId,"model",answer);
   const chunks=answer.match(/[\\s\\S]{1,1900}/g)??[answer];await interaction.editReply(chunks[0]??"Não consegui gerar uma resposta.");
   for(const chunk of chunks.slice(1))await interaction.followUp({content:chunk});
  }catch(error){logger.error({error,userId:interaction.user.id},"Failed to handle /ask");await interaction.editReply("Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.");}
 }
};
