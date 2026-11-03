import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { sendDiscordWebhook } from "./services/discord-webhook.service.js";
import { logger } from "./config/logger.js";
import { commands } from "./commands/index.js";
import { handlePersonaComponent, handlePersonaReset } from "./commands/persona.js";
import { rememberGeneratedAnswer } from "./services/response-memory.service.js";
import { buildAnswerMessages, buildAnswerPreview } from "./services/response-message.service.js";
import { registerSlashCommands } from "./services/command-registration.service.js";
import { replyToUser } from "./services/chat.service.js";
import { initializeLocalCache, closeLocalCache } from "./services/cache.service.js";
import { initializeAIProvider, refreshAIProviderCatalog } from "./services/ai-bootstrap.service.js";
import { initializeGuildPanels, sendWelcome, buildSuggestionModal, buildSupportModal, publishSuggestion, publishSupportRequest, buildTicketModal, createPrivateTicket } from "./services/guild-panels.service.js";
import { broadcastStartup, sendGuildNotice } from "./services/guild-notifications.service.js";

const healthServer = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/helth") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("OK");
    return;
  }
  if (request.method === "POST" && request.url === "/api/internal/ai-bootstrap") {
    const expected = env.AI_BOOTSTRAP_CRON_SECRET;
    const supplied = request.headers.authorization?.replace(/^Bearer\\s+/i, "") ?? "";
    const expectedBuffer = Buffer.from(expected ?? "");
    const suppliedBuffer = Buffer.from(supplied);
    if (!expected || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    try {
      const result = await refreshAIProviderCatalog();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, selected: result.selected, healthyModels: result.healthyModels, tested: result.tested, refreshedAt: new Date().toISOString() }));
    } catch (error) {
      logger.error({ err: error, feature: "scheduled-ai-bootstrap" }, "Scheduled AI bootstrap failed");
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "AI bootstrap failed" }));
    }
    return;
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not Found");
});

const port = Number(process.env.PORT ?? 10000);
healthServer.listen(port, "0.0.0.0", () => logger.info({ feature: "health", port, path: "/api/helth" }, "HTTP health endpoint is listening"));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const commandMap = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ feature: "discord", botTag: readyClient.user.tag, botUserId: readyClient.user.id }, "Discord bot is online");
  await initializeGuildPanels(readyClient);
  await broadcastStartup(readyClient);
  try {
    await registerSlashCommands();
  } catch (error) {
    logger.error({ err: error, feature: "discord-command-registration" }, "Could not synchronize slash commands on startup");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === "lanstec:suggestion:open") { await interaction.showModal(buildSuggestionModal()); return; }
    if (interaction.isButton() && interaction.customId === "lanstec:support:open") { await interaction.showModal(buildSupportModal()); return; }
    if (interaction.isModalSubmit() && interaction.customId === "lanstec:suggestion:submit") {
      await publishSuggestion(interaction.guild!, interaction.user.id, interaction.fields.getTextInputValue("title"), interaction.fields.getTextInputValue("description"));
      await interaction.reply({ content: "Sugestão enviada! Obrigado por contribuir.", ephemeral: true }); return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "lanstec:support:submit") {
      await publishSupportRequest(interaction.guild!, await interaction.guild!.members.fetch(interaction.user.id), interaction.fields.getTextInputValue("subject"), interaction.fields.getTextInputValue("details"));
      await interaction.reply({ content: "Solicitação encaminhada à equipe.", ephemeral: true }); return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("lanstec:docs:")) {
      const key = interaction.customId.split(":").pop()!;
      const info: Record<string,string> = { services: "Consultoria de TI, segurança da informação e conscientização conforme proposta/contrato.", security: "Avaliações somente com autorização expressa, escopo e regras de engajamento acordados.", privacy: "Minimize dados e não compartilhe credenciais ou informações pessoais em canais públicos." };
      await interaction.reply({ content: info[key] ?? "Consulte a documentação pública.", ephemeral: true }); return;
    }
  } catch (error) {
    logger.error({ err: error, feature: "guild-panels" }, "Panel interaction failed");
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "Não foi possível concluir. Tente novamente ou contate a equipe.", ephemeral: true }).catch(() => undefined);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try { await sendWelcome(member); } catch (error) { logger.warn({ err: error, guildId: member.guild.id }, "Welcome card failed"); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId === "lanstec:ticket:open") {
    await interaction.showModal(buildTicketModal());
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === "lanstec:ticket:submit") {
    try {
      const ticket = await createPrivateTicket(interaction.guild!, await interaction.guild!.members.fetch(interaction.user.id), interaction.fields.getTextInputValue("subject"), interaction.fields.getTextInputValue("details"));
      await interaction.reply({ content: "Ticket aberto: " + ticket.toString(), ephemeral: true });
    } catch (error) {
      logger.error({ err: error, feature: "ticket" }, "Ticket creation failed");
      await interaction.reply({ content: "Não consegui criar o ticket. Verifique as permissões do bot.", ephemeral: true });
    }
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith("persona:reset:")) {
    await handlePersonaReset(interaction);
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("answer:remember:")) {
    const [, , ownerId, token] = interaction.customId.split(":");
    if (ownerId !== interaction.user.id || !token) {
      await interaction.reply({ content: "Esse botão pertence a outra pessoa.", ephemeral: true });
      return;
    }
    try {
      await rememberGeneratedAnswer(interaction.user.id, token);
      await interaction.reply({ content: "🧠 Lembrei disso! Salvei a resposta na sua memória.", ephemeral: true });
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, "Could not remember generated answer");
      await interaction.reply({ content: "Não consegui salvar essa resposta. Talvez o botão tenha expirado.", ephemeral: true });
    }
    return;
  }
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
    if (interaction.guildId) void sendGuildNotice(client, interaction.guildId, "logs-do-bot", "❌ Falha em comando", `/${interaction.commandName} • user ${interaction.user.id} • channel ${interaction.channelId} • ${String(error).slice(0,500)}`, 0xef4444);
    void sendDiscordWebhook("Falha em comando", `O comando **/${interaction.commandName}** falhou.`, { color: 0xe74c3c, fields: [{ name: "Servidor", value: interaction.guildId ?? "DM", inline: true }, { name: "Canal", value: interaction.channelId, inline: true }] });
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
    for (const payload of buildAnswerMessages("Olá! Mencione-me junto com sua pergunta ou use /ask.", message.author.id)) await message.reply(payload);
    return;
  }
  if (/^[\s\p{P}\p{S}]+$/u.test(prompt)) {
    for (const payload of buildAnswerMessages("Oi! Estou por aqui. Pode mandar sua pergunta 😊", message.author.id)) await message.reply(payload);
    return;
  }
  const startedAt = Date.now();
  logger.info({ feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, promptChars: prompt.length }, "Bot mention received");
  let typingInterval: ReturnType<typeof setInterval> | undefined;
  let liveReply: Awaited<ReturnType<typeof message.reply>> | undefined;
  let liveIsV2 = false;
  try {
    await message.channel.sendTyping();
    typingInterval = setInterval(() => {
      void message.channel.sendTyping().catch((typingError) => {
        logger.warn({ err: typingError, feature: "discord-typing", channelId: message.channelId }, "Failed to refresh typing indicator");
      });
    }, 8000);

    const needsRecall = /\b(lembra|lembra[rs]?|recorda|recordar|já falamos|conversamos|brainstorming|na outra conversa|da outra vez|o que eu te disse|te contei)\b/i.test(prompt);
    const needsCheck = /\b(pesquise|pesquisar|procure|buscar|busque|confira|verifique|atual|hoje|agora|preço|cotação|notícia|fonte|consulta)\b/i.test(prompt);
    const progressMessage = needsRecall
      ? "Opa, deixa eu puxar isso pela memória rapidão..."
      : needsCheck
        ? "Só um instante, vou conferir isso direitinho..."
        : null;
    if (progressMessage) liveReply = await message.reply(progressMessage);
    let streamedAnswer = "";
    let lastEditAt = 0;
    let pendingEdit = Promise.resolve();
    const answer = await replyToUser(
      { discordUserId: message.author.id, username: message.author.username, channelId: message.channelId, guildId: message.guildId, prompt },
      async (chunk) => {
        if (chunk === "\u0000RESET_STREAM\u0000") {
          streamedAnswer = "";
          lastEditAt = 0;
          pendingEdit = pendingEdit.then(async () => {
            if (!liveReply) return;
            await liveReply.edit("Só mais um instante — estou conferindo o contexto para fechar a resposta.");
            liveIsV2 = false;
          });
          await pendingEdit;
          return;
        }
        streamedAnswer += chunk;
        if (Date.now() - lastEditAt < 650) return;
        lastEditAt = Date.now();
        const preview = buildAnswerPreview(streamedAnswer);
        const previewIsV2 = "flags" in preview;
        pendingEdit = pendingEdit.then(async () => {
          if (!liveReply) return;
          if (previewIsV2 && !liveIsV2) {
            await liveReply.edit({ ...preview, content: null });
            liveIsV2 = true;
          } else {
            await liveReply.edit(preview);
            liveIsV2 = previewIsV2 || liveIsV2;
          }
        });
        await pendingEdit;
      },
    );
    if (typingInterval) { clearInterval(typingInterval); typingInterval = undefined; }
    await pendingEdit;
    const outgoing = buildAnswerMessages(answer, message.author.id);
    const firstPayload = outgoing[0]!;
    if (liveReply) {
      if ("flags" in firstPayload && !liveIsV2) {
        await liveReply.edit({ ...firstPayload, content: null });
        liveIsV2 = true;
      } else {
        await liveReply.edit(firstPayload);
      }
    } else {
      liveReply = await message.reply(firstPayload);
    }
    for (let i = 1; i < outgoing.length; i++) await message.channel.send(outgoing[i]!);
    logger.info({ feature: "discord-mention", userId: message.author.id, channelId: message.channelId, durationMs: Date.now() - startedAt, responseChars: answer.length, layoutMessages: outgoing.length }, "Bot mention handled");
  } catch (error) {
    logger.error({ err: error, feature: "discord-mention", userId: message.author.id, guildId: message.guildId, channelId: message.channelId, durationMs: Date.now() - startedAt, promptChars: prompt.length }, "Failed to handle mention");
    const errorText = "Desculpe, ocorreu um erro ao processar sua mensagem.";
    if (liveReply && liveIsV2) {
      const errorPreview = buildAnswerPreview("**" + errorText + "**", true);
      await liveReply.edit({ ...errorPreview, content: null });
    } else if (liveReply) await liveReply.edit(errorText);
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
  closeLocalCache();
  healthServer.close(() => {
    logger.info({ feature: "process", signal }, "HTTP server closed");
    process.exit(0);
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

logger.info({ feature: "startup", nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL, geminiModel: env.GEMINI_MODEL }, "Starting Discord bot");
try { await initializeLocalCache(); } catch (error) { logger.warn({ err: error, feature: "sqlite-cache" }, "Local cache initialization failed; continuing with Supabase"); }
try { await initializeAIProvider(); } catch (error) { logger.error({ err: error, feature: "ai-bootstrap" }, "AI provider bootstrap failed; generation will use runtime fallback"); }
await client.login(env.DISCORD_TOKEN);
