import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { replyToUser } from "../services/chat.service.js";
import { logger } from "../config/logger.js";
import { buildAnswerMessages, buildAnswerPreview } from "../services/response-message.service.js";

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
    let liveIsV2 = false;
    let pendingEdit = Promise.resolve();

    try {
      const answer = await replyToUser(
        { discordUserId: interaction.user.id, username: interaction.user.username, channelId: interaction.channelId, guildId: interaction.guildId, prompt },
        async (chunk) => {
          streamedText += chunk;
          if (Date.now() - lastEditAt < 650) return;
          lastEditAt = Date.now();
          const preview = buildAnswerPreview(streamedText);
          const previewIsV2 = "flags" in preview;
          pendingEdit = pendingEdit.then(async () => {
            if (previewIsV2 && !liveIsV2) {
              await interaction.editReply({ ...preview, content: null });
              liveIsV2 = true;
            } else {
              await interaction.editReply(preview);
              liveIsV2 = previewIsV2 || liveIsV2;
            }
          });
          await pendingEdit;
        },
      );

      await pendingEdit;
      const outgoing = buildAnswerMessages(answer, interaction.user.id);
      const firstPayload = outgoing[0]!;
      if ("flags" in firstPayload && !liveIsV2) {
        await interaction.editReply({ ...firstPayload, content: null });
        liveIsV2 = true;
      } else {
        await interaction.editReply(firstPayload);
      }
      for (let i = 1; i < outgoing.length; i++) await interaction.followUp(outgoing[i]!);
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id, streamedChars: streamedText.length }, "Failed to handle /ask");
      const errorText = "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.";
      if (liveIsV2) {
        const errorPreview = buildAnswerPreview("**" + errorText + "**", true);
        await interaction.editReply({ ...errorPreview, content: null });
      } else {
        await interaction.editReply(streamedText ? streamedText.slice(0, 1800) + "\n\n" + errorText : errorText);
      }
    }
  },
};
