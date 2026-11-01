import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { replyToUser } from "../services/chat.service.js";
import { logger } from "../config/logger.js";

export const askCommand = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Converse com a inteligência artificial")
    .addStringOption((option) => option.setName("mensagem").setDescription("O que você quer perguntar?").setRequired(true).setMaxLength(4000)),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prompt = interaction.options.getString("mensagem", true).trim();
    await interaction.deferReply();
    let streamedText = "";
    let lastEditAt = 0;
    let lastPublishedLength = 0;
    try {
      const answer = await replyToUser(
        { discordUserId: interaction.user.id, username: interaction.user.username, channelId: interaction.channelId, guildId: interaction.guildId, prompt },
        async (chunk) => {
          streamedText += chunk;
          const visibleText = streamedText.slice(0, 1900);
          if (visibleText.length - lastPublishedLength >= 120 || Date.now() - lastEditAt >= 900) {
            await interaction.editReply(visibleText);
            lastPublishedLength = visibleText.length;
            lastEditAt = Date.now();
          }
        },
      );
      const firstChunk = answer.slice(0, 1900) || "Não consegui gerar uma resposta.";
      await interaction.editReply(firstChunk);
      const remainder = answer.slice(1900);
      const chunks = remainder.match(/[\\s\\S]{1,1900}/g) ?? [];
      for (const chunk of chunks) await interaction.followUp({ content: chunk });
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id, streamedChars: streamedText.length }, "Failed to handle /ask");
      const errorText = "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.";
      await interaction.editReply(streamedText ? streamedText.slice(0, 1800) + "\\n\\n" + errorText : errorText);
    }
  },
};
