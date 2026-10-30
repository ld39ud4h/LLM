import { SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { forgetMemories } from "../services/memory.service.js";import { logger } from "../config/logger.js";
export const forgetCommand={
 data:new SlashCommandBuilder().setName("forget").setDescription("Apaga todas as informações salvas na sua memória"),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  await interaction.deferReply({ephemeral:true});
  try{await forgetMemories(interaction.user.id);await interaction.editReply("As informações da sua memória foram apagadas. O histórico de conversas permanece salvo.");}
  catch(error){logger.error({error},"Could not clear user memories");await interaction.editReply("Não consegui apagar sua memória agora.");}
 }
};
