import { Client, ChannelType, ContainerBuilder, TextDisplayBuilder, MessageFlags } from "discord.js";
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
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\\n${detail}`))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# LANSTEC • ${new Date().toLocaleString("pt-BR")}`));
    await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn({ err: error, guildId, channelName, feature: "guild-notice" }, "Could not send guild operational notice");
  }
}

export async function broadcastStartup(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await sendGuildNotice(client, guild.id, "status-e-alertas", "🟢 Bot inicializado", `Conectado como **${client.user?.tag ?? "LANSTEC Bot"}**. Painéis e comandos estão sendo sincronizados.`, 0x22c55e);
    await sendGuildNotice(client, guild.id, "logs-do-bot", "🚀 Inicialização", `Gateway conectado • guild: ${guild.id} • usuário: ${client.user?.id}`);
  }
}
