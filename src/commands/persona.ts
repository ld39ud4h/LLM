import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
} from "discord.js";
import { logger } from "../config/logger.js";
import {
  DEFAULT_PERSONA_KEY,
  resetUserPersona,
  PERSONA_PRESETS,
  getUserPersonaKey,
  setUserPersona,
  type PersonaKey,
} from "../services/user-persona.service.js";

const SELECT_PREFIX = "persona:select:";
const RESET_PREFIX = "persona:reset:";

function personaEmoji(key: PersonaKey): string {
  const emojis: Record<PersonaKey, string> = {
    playful: "😎",
    professional: "💼",
    teacher: "📚",
    concise: "🎯",
    technical: "🛠️",
    friendly: "🤝",
  };
  return emojis[key];
}

function buildPersonaPanel(ownerId: string, current: PersonaKey | undefined, notice?: string): ContainerBuilder {
  const selected = current ?? DEFAULT_PERSONA_KEY;
  const activePreset = PERSONA_PRESETS[selected];
  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_PREFIX + ownerId)
    .setPlaceholder("Escolha sua personalidade")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ...Object.entries(PERSONA_PRESETS).map(([key, preset]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(preset.label)
          .setDescription(preset.description)
          .setValue(key)
          .setEmoji(personaEmoji(key as PersonaKey))
          .setDefault(key === selected),
      ),
    );

  const titleSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎭 Personalização do consultor"))
    .setButtonAccessory(
      new ButtonBuilder().setCustomId(RESET_PREFIX + ownerId).setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    );

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addSectionComponents(titleSection)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Escolha como você prefere conversar comigo. Essa configuração é **individual** e não altera a experiência de outros membros."),
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        (notice ?? activePreset.description) +
          "\n\n-# 🟢 Personalidade ativa: **" + activePreset.label + "**",
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
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Não consegui abrir suas configurações agora. Tente novamente.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Não consegui abrir suas configurações agora. Tente novamente.",
          ephemeral: true,
        });
      }
    }
  },
};

export async function handlePersonaComponent(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith(SELECT_PREFIX)) return;
  const ownerId = interaction.customId.slice(SELECT_PREFIX.length);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "Esse painel pertence a outra pessoa. Use /persona para abrir o seu. 🙂",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  try {
    const choice = interaction.values[0];
    if (!choice) return;

    if (!(choice in PERSONA_PRESETS)) {
      const current = await getUserPersonaKey(interaction.user.id);
      await interaction.editReply({
        components: [
          buildPersonaPanel(
            interaction.user.id,
            current,
            "Não reconheci essa opção. Escolha uma das personalidades disponíveis.",
          ),
        ],
      });
      return;
    }

    const key = choice as PersonaKey;
    await setUserPersona(interaction.user.id, key);
    await interaction.editReply({
      components: [
        buildPersonaPanel(
          interaction.user.id,
          key,
          "✅ **Personalidade atualizada!** " + PERSONA_PRESETS[key].description,
        ),
      ],
    });
  } catch (error) {
    logger.error(
      { err: error, userId: interaction.user.id, choice: interaction.values[0] },
      "Could not process persona selection",
    );
    const current = await getUserPersonaKey(interaction.user.id).catch(() => undefined);
    await interaction.editReply({
      components: [
        buildPersonaPanel(
          interaction.user.id,
          current,
          "Não consegui salvar essa alteração. Tente novamente em instantes.",
        ),
      ],
    });
  }
}

export async function handlePersonaReset(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith(RESET_PREFIX)) return;
  const ownerId = interaction.customId.slice(RESET_PREFIX.length);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Esse painel pertence a outra pessoa. Use /persona para abrir o seu. 🙂", ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  try {
    await resetUserPersona(interaction.user.id);
    await interaction.editReply({ components: [buildPersonaPanel(interaction.user.id, undefined, "✅ **Personalidade restaurada!** Seu estilo voltou ao padrão.")] });
  } catch (error) {
    logger.error({ err: error, userId: interaction.user.id }, "Could not reset user persona");
    const current = await getUserPersonaKey(interaction.user.id).catch(() => undefined);
    await interaction.editReply({ components: [buildPersonaPanel(interaction.user.id, current, "Não consegui restaurar a personalidade. Tente novamente.")] });
  }
}
