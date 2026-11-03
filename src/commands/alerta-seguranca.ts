import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { sendGuildNotice } from "../services/guild-notifications.service.js";

export const securityAlertCommand = {
  data: new SlashCommandBuilder().setName("alerta-seguranca").setDescription("Registra um alerta no canal de segurança")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName("titulo").setDescription("Título do alerta").setRequired(true).setMaxLength(120))
    .addStringOption(o=>o.setName("detalhes").setDescription("Resumo sem credenciais ou dados sensíveis").setRequired(true).setMaxLength(900)),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) { await interaction.reply({content:"Use em um servidor.",ephemeral:true}); return; }
    await interaction.deferReply({ephemeral:true});
    await sendGuildNotice(interaction.client, interaction.guildId, "alertas-de-seguranca",
      "🛡️ " + interaction.options.getString("titulo",true),
      interaction.options.getString("detalhes",true) + "\\nRegistrado por <@" + interaction.user.id + ">.", 0xf97316);
    await interaction.editReply("Alerta encaminhado ao canal #alertas-de-seguranca.");
  }
};
