import { PermissionFlagsBits,SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { setGuildSystemPrompt } from "../services/guild-settings.service.js";import { logger } from "../config/logger.js";
export const personaCommand={
 data:new SlashCommandBuilder().setName("persona").setDescription("Define a personalidade da IA neste servidor (administradores)").addStringOption(option=>option.setName("instrucao").setDescription("Personalidade e orientações gerais da IA").setRequired(true).setMaxLength(1500)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  if(!interaction.guildId){await interaction.reply({content:"Este comando só funciona em servidores.",ephemeral:true});return;}
  await interaction.deferReply({ephemeral:true});
  try{await setGuildSystemPrompt(interaction.guildId,interaction.options.getString("instrucao",true).trim());await interaction.editReply("Personalidade do assistente atualizada para este servidor.");}
  catch(error){logger.error({error,guildId:interaction.guildId},"Could not update guild persona");await interaction.editReply("Não consegui atualizar a personalidade agora.");}
 }
};
