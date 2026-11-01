import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { logger } from "../config/logger.js";
import { resetUserPersona, setUserPersona } from "../services/user-persona.service.js";

export const personaCommand = {
  data: new SlashCommandBuilder()
    .setName("persona")
    .setDescription("Personalize como o consultor conversa com você")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("definir")
        .setDescription("Defina seu estilo de conversa")
        .addStringOption((option) =>
          option.setName("personalidade")
            .setDescription("Ex.: descontraído, direto, técnico, formal, engraçado...")
            .setRequired(true)
            .setMaxLength(1500),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("resetar").setDescription("Volte à personalidade padrão do consultor"),
    ),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "definir") {
        const persona = interaction.options.getString("personalidade", true).trim();
        if (!persona) {
          await interaction.editReply("Me diga pelo menos uma característica para personalizar sua conversa.");
          return;
        }
        await setUserPersona(interaction.user.id, persona);
        await interaction.editReply("Fechado! Sua personalidade foi salva. A partir de agora, vou conversar com você desse jeito. 😎");
        return;
      }
      await resetUserPersona(interaction.user.id);
      await interaction.editReply("Personalidade personalizada removida. Voltamos ao meu jeito padrão: consultor gente boa, brincalhão e prestativo. 😉");
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, "Could not update user persona");
      await interaction.editReply("Não consegui atualizar sua personalidade agora. Tente novamente daqui a pouco.");
    }
  },
};
