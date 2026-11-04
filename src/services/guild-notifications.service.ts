import { Client, ChannelType, ContainerBuilder, TextDisplayBuilder, MessageFlags, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } from "discord.js";
import { commands } from "../commands/index.js";
import { logger } from "../config/logger.js";

export type OperationalChannel = "status-e-alertas" | "logs-do-bot" | "alertas-de-seguranca";

export async function sendGuildNotice(client: Client, guildId: string, channelName: OperationalChannel, title: string, detail: string, color = 0x06b6d4): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === channelName);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      logger.warn({ guildId, channelName, feature: "guild-notice" }, "Operational channel not found");
      return;
    }
    const card = new ContainerBuilder().setAccentColor(color)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${detail}`))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# LANSTEC • ${new Date().toLocaleString("pt-BR")}`));
    await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn({ err: error, guildId, channelName, feature: "guild-notice" }, "Could not send guild operational notice");
  }
}

export async function broadcastStartup(client: Client): Promise<void> {
  const bot = client.user;
  if (!bot) return;
  const panelCount = 5;
  const commandCount = commands.length;

  for (const guild of client.guilds.cache.values()) {
    const statusChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === "status-e-alertas");
    if (statusChannel?.isTextBased() && "send" in statusChannel) {
      const card = new ContainerBuilder().setAccentColor(0x22c55e)
        .addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("# 🟢 Bot inicializado"),
            new TextDisplayBuilder().setContent(`Conectado como **${bot.displayName}**`),
            new TextDisplayBuilder().setContent(`**${panelCount} painéis** e **${commandCount} comandos** estão sendo configurados.`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder()
            .setURL(bot.displayAvatarURL({ extension: "png", size: 256 }))
            .setDescription("Avatar do bot")))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# LANSTEC • ${new Date().toLocaleString("pt-BR")}`));
      await statusChannel.send({ components: [card], flags: [MessageFlags.IsComponentsV2] });
    }

    const logsChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === "logs-do-bot");
    if (logsChannel?.isTextBased() && "send" in logsChannel) {
      const botMember = await guild.members.fetch(bot.id).catch(() => null);
      const card = new ContainerBuilder().setAccentColor(0x06b6d4)
        .addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("# 🚀 Inicialização"),
            new TextDisplayBuilder().setContent(`Gateway conectado • servidor: **${guild.name}**`),
            new TextDisplayBuilder().setContent(`Bot: **${botMember?.displayName ?? bot.displayName}**`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder()
            .setURL(guild.iconURL({ extension: "png", size: 256 }) ?? bot.displayAvatarURL({ extension: "png", size: 256 }))
            .setDescription(`Ícone do servidor ${guild.name}`)))
        .addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**Identidade do bot**"),
            new TextDisplayBuilder().setContent(`Nome de exibição: **${botMember?.displayName ?? bot.displayName}**`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder()
            .setURL(botMember?.displayAvatarURL({ extension: "png", size: 256 }) ?? bot.displayAvatarURL({ extension: "png", size: 256 }))
            .setDescription("Avatar do bot")))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# LANSTEC • ${new Date().toLocaleString("pt-BR")}`));
      await logsChannel.send({ components: [card], flags: [MessageFlags.IsComponentsV2] });
    }
  }
}
