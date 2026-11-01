import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { logger } from "../config/logger.js";
import {
  DEFAULT_PERSONA_KEY,
  PERSONA_PRESETS,
  getUserPersonaKey,
  resetUserPersona,
  setUserPersona,
  type PersonaKey,
} from "../services/user-persona.service.js";

const SELECT_PREFIX = "persona:select:";

function buildPersonaPanel(ownerId: string, current: PersonaKey | undefined, notice?: string): ContainerBuilder {
  const selected = current ?? DEFAULT_PERSONA_KEY;
  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_PREFIX + ownerId)
    .setPlaceholder("Escolha uma ação ou personalidade")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Ver minha personalidade atual")
        .setDescription("Mostra qual estilo está ativo na sua conta")
        .setValue("view")
        .setEmoji("👁️"),
      ...Object.entries(PERSONA_PRESETS).map(([key, preset]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(preset.label)
          .setDescription(preset.description)
          .setValue(key)
          .setEmoji(key === "playful" ? "😎" : key === "professional" ? "💼" : key === "teacher" ? "📚" : key === "concise" ? "🎯" : key === "technical" ? "🛠️" : "🤝")
          .setDefault(key === selected),
      ),
      new StringSelectMenuOptionBuilder()
        .setLabel("Restaurar personalidade padrão")
        .setDescription("Volta ao consultor brincalhão e prestativo")
        .setValue("reset")
        .setEmoji("🔄"),
    );

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 🎭 Personalização do consultor\nEscolha como você prefere conversar comigo. Essa configuração é **individual** e não altera a experiência de outros membros."),
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        notice ?? "**Estilo ativo:** " + PERSONA_PRESETS[selected].label + "\nVocê pode mudar essa opção quando quiser usando este mesmo menu.",
      ),
    );
}

export const personaCommand = {
  data: new SlashCommandBuilder()
    .setName("persona")
    .setDescription("Escolha e gerencie sua personalidade de conversa"),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const current = await getUserPersonaKey(interaction.user.id);
      await interaction.reply({
        components: [buildPersonaPanel(interaction.user.id, current)],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, "Could not open persona panel");
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: "Não consegui abrir suas configurações agora. Tente novamente.", ephemeral: true });
      else await interaction.reply({ content: "Não consegui abrir suas configurações agora. Tente novamente.", ephemeral: true });
    }
  },
};

export async function handlePersonaComponent(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith(SELECT_PREFIX)) return;
  const ownerId = interaction.customId.slice(SELECT_PREFIX.length);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Esse painel pertence a outra pessoa. Use /persona para abrir o seu. 🙂", ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  try {
    const choice = interaction.values[0];
    if (!choice) return;
    if (choice === "view") {
      const current = await getUserPersonaKey(interaction.user.id);
      const active = current ?? DEFAULT_PERSONA_KEY;
      await interaction.editReply({
        components: [buildPersonaPanel(interaction.user.id, current, "**Sua personalidade atual:** " + PERSONA_PRESETS[active].label + "\n" + PERSONA_PRESETS[active].description + "\n\nSelecione outra opção abaixo para alterar.")],
      });
      return;
    }
    if (choice === "reset") {
      await resetUserPersona(interaction.user.id);
      await interaction.editReply({
        components: [buildPersonaPanel(interaction.user.id, undefined, "✅ **Personalidade restaurada!** Seu padrão agora é **" + PERSONA_PRESETS[DEFAULT_PERSONA_KEY].label + "**.")],
      });
      return;
    }
    if (!(choice in PERSONA_PRESETS)) {
      await interaction.editReply({ components: [buildPersonaPanel(interaction.user.id, await getUserPersonaKey(interaction.user.id), "Não reconheci essa opção. Escolha uma das personalidades disponíveis.")] });
      return;
    }
    const key = choice as PersonaKey;
    await setUserPersona(interaction.user.id, key);
    await interaction.editReply({
      components: [buildPersonaPanel(interaction.user.id, key, "✅ **Personalidade atualizada!** A partir de agora, vou conversar com você no estilo **" + PERSONA_PRESETS[key].label + "**.")],
    });
  } catch (error) {
    logger.error({ err: error, userId: interaction.user.id, choice: interaction.values[0] }, "Could not process persona selection");
    const current = await getUserPersonaKey(interaction.user.id).catch(() => undefined);
    await interaction.editReply({
      components: [buildPersonaPanel(interaction.user.id, current, "Não consegui salvar essa alteração. Tente novamente em instantes.")],
    });
  }
}
