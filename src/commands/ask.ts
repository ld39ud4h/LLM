import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { replyToUser } from "../services/chat.service.js";
import { logger } from "../config/logger.js";
import { buildAnswerMessages } from "../services/response-message.service.js";

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
      );
      const outgoing = buildAnswerMessages(answer, interaction.user.id);
      const [first, ...rest] = outgoing;
      if (first) await interaction.editReply(first);
      for (const payload of rest) await interaction.followUp(payload);
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id, streamedChars: streamedText.length }, "Failed to handle /ask");
      const errorText = "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.";
      await interaction.editReply(streamedText ? streamedText.slice(0, 1800) + "\n\n" + errorText : errorText);
    }
  },
};
