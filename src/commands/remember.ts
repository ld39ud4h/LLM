import { SlashCommandBuilder,type ChatInputCommandInteraction } from "discord.js";
import { remember } from "../services/memory.service.js";import { logger } from "../config/logger.js";
export const rememberCommand={
 data:new SlashCommandBuilder().setName("remember").setDescription("Salva uma informação na sua memória persistente").addStringOption(option=>option.setName("informacao").setDescription("O que devo lembrar?").setRequired(true).setMaxLength(500)),
 async execute(interaction:ChatInputCommandInteraction):Promise<void>{
  await interaction.deferReply({ephemeral:true});
  try{await remember(interaction.user.id,interaction.options.getString("informacao",true).trim());await interaction.editReply("Informação salva. Consulte com /memories ou apague com /forget.");}
  catch(error){logger.error({error},"Could not save user memory");await interaction.editReply("Não consegui salvar essa informação. Tente novamente.");}
 }
};
