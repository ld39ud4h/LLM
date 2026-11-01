import { createServer } from "node:http";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { commands } from "./commands/index.js";
import { handlePersonaComponent } from "./commands/persona.js";
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
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("persona:select:")) {
    try {
      await handlePersonaComponent(interaction);
    } catch (error) {
      logger.error({ err: error, feature: "persona-component", userId: interaction.user.id }, "Persona component interaction failed");
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Não consegui processar sua escolha. Tente novamente.", ephemeral: true }).catch(() => undefined);
      }
    }
    return;
  }

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
  if (/^[\s\p{P}\p{S}]+$/u.test(prompt)) {
    await message.reply("Oi! Estou por aqui. Pode mandar sua pergunta 😊");
    return;
  }
  const startedAt = Date.now();
  logger.info({ feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, promptChars: prompt.length }, "Bot mention received");
  let typingInterval: ReturnType<typeof setInterval> | undefined;
  let liveReply: Awaited<ReturnType<typeof message.reply>> | undefined;
  let streamedText = "";
  let lastPublishedLength = 0;
  let lastEditAt = 0;
  try {
    await message.channel.sendTyping();
    typingInterval = setInterval(() => {
      void message.channel.sendTyping().catch((typingError) => {
        logger.warn({ err: typingError, feature: "discord-typing", channelId: message.channelId }, "Failed to refresh typing indicator");
      });
    }, 8000);

    const answer = await replyToUser(
      { discordUserId: message.author.id, username: message.author.username, channelId: message.channelId, guildId: message.guildId, prompt },
      async (chunk) => {
        streamedText += chunk;
        const visibleText = streamedText.slice(0, 1900);
        if (!liveReply) {
          liveReply = await message.reply(visibleText);
          if (typingInterval) {
            clearInterval(typingInterval);
            typingInterval = undefined;
          }
          lastPublishedLength = visibleText.length;
          lastEditAt = Date.now();
          return;
        }
        if (visibleText.length - lastPublishedLength >= 120 || Date.now() - lastEditAt >= 900) {
          await liveReply.edit(visibleText);
          lastPublishedLength = visibleText.length;
          lastEditAt = Date.now();
        }
      },
    );

    const firstChunk = answer.slice(0, 1900) || "Não consegui gerar uma resposta.";
    if (liveReply) await liveReply.edit(firstChunk);
    else liveReply = await message.reply(firstChunk);
    const remainder = answer.slice(1900);
    const chunks = remainder.match(/[\s\S]{1,1900}/g) ?? [];
    for (const chunk of chunks) await message.channel.send(chunk);
    logger.info({ feature: "discord-mention", userId: message.author.id, channelId: message.channelId, durationMs: Date.now() - startedAt, responseChars: answer.length, streamed: true }, "Bot mention handled");
  } catch (error) {
    logger.error({ err: error, feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, durationMs: Date.now() - startedAt, promptChars: prompt.length, streamedChars: streamedText.length }, "Failed to handle mention");
    const errorText = "Desculpe, ocorreu um erro ao processar sua mensagem.";
    if (liveReply) await liveReply.edit(streamedText.slice(0, 1850) + "\n\n" + errorText);
    else await message.reply(errorText);
  } finally {
    if (typingInterval) clearInterval(typingInterval);
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
