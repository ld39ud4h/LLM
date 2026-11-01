import { createServer } from "node:http";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { commands } from "./commands/index.js";
import { replyToUser } from "./services/chat.service.js";

const healthServer = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/helth") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("OK");
    return;
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not Found");
});

const port = Number(process.env.PORT ?? 10000);
healthServer.listen(port, "0.0.0.0", () => logger.info({ feature: "health", port, path: "/api/helth" }, "HTTP health endpoint is listening"));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const commandMap = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ feature: "discord", botTag: readyClient.user.tag, botUserId: readyClient.user.id }, "Discord bot is online");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) {
    logger.warn({ feature: "discord", command: interaction.commandName, userId: interaction.user.id }, "Unknown slash command");
    return;
  }
  const startedAt = Date.now();
  logger.info({ feature: "discord-command", command: interaction.commandName, userId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId }, "Slash command received");
  try {
    await command.execute(interaction);
    logger.info({ feature: "discord-command", command: interaction.commandName, userId: interaction.user.id, durationMs: Date.now() - startedAt }, "Slash command handler completed");
  } catch (error) {
    logger.error({ err: error, feature: "discord-command", command: interaction.commandName, userId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId, durationMs: Date.now() - startedAt }, "Slash command handler failed");
    try {
      const content = "Ocorreu um erro ao executar este comando. Tente novamente.";
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content, ephemeral: true });
      else await interaction.reply({ content, ephemeral: true });
    } catch (replyError) {
      logger.error({ err: replyError, feature: "discord-command", command: interaction.commandName }, "Failed to send command error response");
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !client.user || !message.guild || !message.mentions.has(client.user)) return;
  const mentionPattern = new RegExp("<@!?" + client.user.id + ">", "g");
  const prompt = message.content.replace(mentionPattern, "").trim();
  if (!prompt) {
    await message.reply("Olá! Mencione-me junto com sua pergunta ou use /ask.");
    return;
  }
  const startedAt = Date.now();
  logger.info({ feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, promptChars: prompt.length }, "Bot mention received");
  try {
    await message.channel.sendTyping();
    const answer = await replyToUser({ discordUserId: message.author.id, username: message.author.username, channelId: message.channelId, guildId: message.guildId, prompt });
    const chunks = answer.match(/[\s\S]{1,1900}/g) ?? [answer];
    await message.reply(chunks[0] ?? "Não consegui gerar uma resposta.");
    for (const chunk of chunks.slice(1)) await message.channel.send(chunk);
    logger.info({ feature: "discord-mention", userId: message.author.id, channelId: message.channelId, durationMs: Date.now() - startedAt, responseChars: answer.length }, "Bot mention handled");
  } catch (error) {
    logger.error({ err: error, feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, durationMs: Date.now() - startedAt, promptChars: prompt.length }, "Failed to handle mention");
    await message.reply("Desculpe, ocorreu um erro ao processar sua mensagem.");
  }
});

client.on(Events.Error, (error) => logger.error({ err: error, feature: "discord" }, "Discord client error"));
client.on(Events.Warn, (warning) => logger.warn({ feature: "discord", warning }, "Discord client warning"));
process.on("unhandledRejection", (reason) => logger.error({ err: reason, feature: "process" }, "Unhandled promise rejection"));
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error, feature: "process" }, "Uncaught exception");
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ feature: "process", signal }, "Graceful shutdown started");
  client.destroy();
  healthServer.close(() => {
    logger.info({ feature: "process", signal }, "HTTP server closed");
    process.exit(0);
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

logger.info({ feature: "startup", nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL, geminiModel: env.GEMINI_MODEL }, "Starting Discord bot");
await client.login(env.DISCORD_TOKEN);
