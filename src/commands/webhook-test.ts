import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { sendDiscordWebhook } from "../services/discord-webhook.service.js";

export const webhookTestCommand = {
  data: new SlashCommandBuilder()
    .setName("webhook_test")
    .setDescription("Testa o canal de monitoramento LANSTEC.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    await sendDiscordWebhook("Teste de integração", `Teste solicitado por **${interaction.user.tag}** no servidor **${interaction.guild?.name ?? "Discord"}**.`, {
      color: 0x16b8c9,
      fields: [{ name: "Resultado", value: "Webhook alcançado pelo bot", inline: true }],
    });
    await interaction.editReply("Solicitação de teste enviada. Confira o canal configurado; se não chegar, verifique o segredo no Render.");
  },
};
