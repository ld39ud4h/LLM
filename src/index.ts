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
healthServer.listen(port, "0.0.0.0", () => {
  logger.info({ port, path: "/api/helth" }, "HTTP health endpoint is listening");
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const commandMap = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) =>
  logger.info({ tag: readyClient.user.tag }, "Discord bot is online"),
);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (command) await command.execute(interaction);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !client.user || !message.guild || !message.mentions.has(client.user)) return;
  const mentionPattern = new RegExp("<@!?" + client.user.id + ">", "g");
  const prompt = message.content.replace(mentionPattern, "").trim();
  if (!prompt) {
    await message.reply("Olá! Mencione-me junto com sua pergunta ou use /ask.");
    return;
  }
  try {
    await message.channel.sendTyping();
    const answer = await replyToUser({
      discordUserId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      guildId: message.guildId,
      prompt,
    });
    const chunks = answer.match(/[\\s\\S]{1,1900}/g) ?? [answer];
    await message.reply(chunks[0] ?? "Não consegui gerar uma resposta.");
    for (const chunk of chunks.slice(1)) await message.channel.send(chunk);
  } catch (error) {
    logger.error({ error, userId: message.author.id, channelId: message.channelId }, "Failed to handle mention");
    await message.reply("Desculpe, ocorreu um erro ao processar sua mensagem.");
  }
});

client.on(Events.Error, (error) => logger.error({ error }, "Discord client error"));
process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled rejection"));

const shutdown = () => {
  client.destroy();
  healthServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await client.login(env.DISCORD_TOKEN);
