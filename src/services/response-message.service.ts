import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { registerAnswerForRemember } from "./response-memory.service.js";

function isSimpleAnswer(text: string): boolean {
  const trimmed = text.trim();
  const structured = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|)/m.test(trimmed)
    || /\n\s*```/.test(trimmed)
    || /\n\s*\n/.test(trimmed);
  return trimmed.length <= 260 && !structured;
}

function splitAnswer(text: string, limit: number): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.55) cut = remaining.lastIndexOf(" ", limit);
    if (cut < limit * 0.55) cut = limit;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

export function buildAnswerMessages(answer: string, userId: string) {
  const parts = splitAnswer(answer || "Não consegui gerar uma resposta.", 3500);
  return parts.map((part, index) => {
    const token = registerAnswerForRemember(userId, part);
    const button = new ButtonBuilder()
      .setCustomId("answer:remember:" + userId + ":" + token)
      .setLabel("Lembrar")
      .setEmoji("🧠")
      .setStyle(ButtonStyle.Secondary);

    if (isSimpleAnswer(part)) {
      return {
        content: part,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
        allowedMentions: { parse: [] as const },
      };
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(part))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# Consultor · Resposta " + (index + 1) + "/" + parts.length),
      )
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(button));

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] as const },
    };
  });
}
