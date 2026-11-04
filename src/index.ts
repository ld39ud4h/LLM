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
import { initializeGuildPanels, sendWelcome, buildSuggestionModal, buildSupportModal, publishSuggestion, publishSupportRequest, buildTicketModal, createPrivateTicket, publishOperationalLog } from "./services/guild-panels.service.js";
import { broadcastStartup, sendGuildNotice } from "./services/guild-notifications.service.js";
import { handleInternalApi } from "./api/internal-api.js";
import { saveTicket, saveSuggestion, saveSupport, closeTicket, claimTicket, persistTicketMessage } from "./services/guild-data.service.js";
import { listTasks,listProjects,createTask,updateTask,deleteTask,createProject,updateProject,deleteProject } from "./services/workspace.service.js";
import { workHome,taskList,projectList,taskDetail,projectDetail,taskModal,projectModal } from "./services/workspace-panel.service.js";

const healthServer = createServer(async (request, response) => {
  if (await handleInternalApi(request, response)) return;
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
      const title = interaction.fields.getTextInputValue("title"); const description = interaction.fields.getTextInputValue("description");
      await publishSuggestion(interaction.guild!, interaction.user.id, title, description);
      await saveSuggestion({guildId:interaction.guild!.id,authorId:interaction.user.id,title,description});
      await interaction.reply({ content: "Sugestão enviada! Obrigado por contribuir.", ephemeral: true }); return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "lanstec:support:submit") {
      const subject = interaction.fields.getTextInputValue("subject"); const details = interaction.fields.getTextInputValue("details");
      await publishSupportRequest(interaction.guild!, await interaction.guild!.members.fetch(interaction.user.id), subject, details);
      await saveSupport({guildId:interaction.guild!.id,requesterId:interaction.user.id,subject,details});
      await interaction.reply({ content: "Solicitação encaminhada à equipe.", ephemeral: true }); return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("lanstec:docs:")) {
      const key = interaction.customId.split(":").pop()!;
      const info: Record<string,string> = { services: "Consultoria de TI, segurança da informação e conscientização conforme proposta/contrato.", security: "Avaliações somente com autorização expressa, escopo e regras de engajamento acordados.", privacy: "Minimize dados e não compartilhe credenciais ou informações pessoais em canais públicos." };
      await interaction.reply({ content: info[key] ?? "Consulte a documentação pública.", ephemeral: true }); return;
    }
  } catch (error) {
    logger.error({ err: error, feature: "guild-panels" }, "Panel interaction failed");
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: "Não foi possível concluir. Tente novamente ou contate a equipe.", ephemeral: true }).catch(() => undefined);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try { await sendWelcome(member); } catch (error) { logger.warn({ err: error, guildId: member.guild.id }, "Welcome card failed"); }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId === "lanstec:ticket:open") { await interaction.showModal(buildTicketModal()); return; }
  if (interaction.isModalSubmit() && interaction.customId === "lanstec:ticket:submit") {
    try {
      const subject=interaction.fields.getTextInputValue("subject"), details=interaction.fields.getTextInputValue("details");
      const ticket=await createPrivateTicket(interaction.guild!,await interaction.guild!.members.fetch(interaction.user.id),subject,details,interaction.channelId ?? undefined);
      await saveTicket({guildId:interaction.guild!.id,channelId:ticket.id,requesterId:interaction.user.id,subject,details});
      await interaction.reply({content:"Ticket aberto: "+ticket.toString(),ephemeral:true});
    } catch(error) { logger.error({err:error,feature:"ticket"},"Ticket creation failed"); await interaction.reply({content:"Não consegui criar o ticket. Verifique as permissões do bot.",ephemeral:true}); }
    return;
  }
  if(interaction.isButton() && ["lanstec:ticket:claim","lanstec:ticket:close"].includes(interaction.customId)) {
    try {
      if(!interaction.guild||!interaction.channel||!interaction.channel.isThread()){await interaction.reply({content:"Ação disponível somente dentro de um tópico de ticket.",ephemeral:true});return;}
      const member=await interaction.guild.members.fetch(interaction.user.id);
      const staff=member.permissions.has("ManageChannels")||member.permissions.has("Administrator")||member.roles.cache.some(r=>["Administrador","Gerente","Suporte técnico","Coordenador técnico"].includes(r.name));
      if(!staff){await interaction.reply({content:"Somente a equipe pode assumir ou encerrar tickets.",ephemeral:true});return;}
      if(interaction.customId==="lanstec:ticket:claim"){await claimTicket(interaction.channel.id,interaction.user.id);await interaction.reply({content:"🧑‍💻 Ticket assumido por <@"+interaction.user.id+">"});return;}
      const closed=await closeTicket(interaction.channel.id,interaction.user.id);
      await interaction.reply({content:"🔒 Ticket encerrado. Este tópico será excluído em 5 segundos.",ephemeral:true});
      await interaction.channel.send("🔒 Ticket encerrado por <@"+interaction.user.id+">. Transcrição preservada no banco.\n🗑️ Este tópico será excluído em **5 segundos**.");
      await publishOperationalLog(interaction.guild, "🔒 Ticket encerrado", `**Ticket:** ${interaction.channel.id}\n**Solicitante:** <@${closed.requester_id}>\n**Encerrado por:** <@${interaction.user.id}>\n**Exclusão:** em 5 segundos`, "delete");
      logger.info({guildId:interaction.guild.id,ticketId:interaction.channel.id,requesterId:closed.requester_id,closedBy:interaction.user.id,deleteAfterMs:5000,operation:"ticket_close"}, "Ticket encerrado; exclusão agendada");
      await new Promise(resolve=>setTimeout(resolve,5000));
      await interaction.channel.delete("Ticket encerrado — limpeza após 5 segundos");
      logger.info({guildId:interaction.guild.id,ticketId:interaction.channel.id,operation:"ticket_delete"}, "Tópico privado de ticket excluído");
      await publishOperationalLog(interaction.guild, "🗑️ Tópico de ticket excluído", `**ID:** ${interaction.channel.id}\n**Motivo:** encerramento + 5 segundos`, "delete");
    } catch(error) {logger.error({err:error,feature:"ticket-action"},"Ticket action failed");if(interaction.isRepliable()&&!interaction.replied)await interaction.reply({content:"Não foi possível concluir a ação.",ephemeral:true}).catch(()=>undefined);}
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

client.on(Events.MessageCreate, async message => {
 if(!message.guild||!message.channel.isTextBased()||!("id" in message.channel))return;
 try { await persistTicketMessage({channelId:message.channel.id,messageId:message.id,authorId:message.author.id,authorTag:message.author.tag,content:message.content,attachments:message.attachments.map(a=>({name:a.name,url:a.url,contentType:a.contentType,size:a.size})),createdAt:message.createdAt.toISOString()}); }
 catch(error){logger.warn({err:error,channelId:message.channel.id,messageId:message.id},"Ticket transcript persistence failed");}
});

client.on(Events.InteractionCreate, async (interaction) => {
 if(!interaction.isButton()&&!interaction.isStringSelectMenu()&&!interaction.isModalSubmit())return;
 const id=interaction.customId;
 if(!id.startsWith("lanstec:work:"))return;
 try{
  if(!interaction.guildId){await interaction.reply({content:"Este painel funciona dentro de um servidor.",ephemeral:true});return;}
  const guildId=interaction.guildId,userId=interaction.user.id;
  if(interaction.isButton()&&id==="lanstec:work:open"){await interaction.reply(workHome());return;}
  if(interaction.isButton()&&id==="lanstec:work:home"){await interaction.reply(workHome());return;}
  if(interaction.isButton()&&id==="lanstec:work:tasks"||interaction.isButton()&&id==="lanstec:work:tasks"){await interaction.reply(taskList(await listTasks(guildId,userId)));return;}
  if(interaction.isButton()&&id==="lanstec:work:projects"){await interaction.reply(projectList(await listProjects(guildId,userId)));return;}
  if(interaction.isButton()&&id==="lanstec:work:task:create"){await interaction.showModal(taskModal("create"));return;}
  if(interaction.isButton()&&id==="lanstec:work:project:create"){await interaction.showModal(projectModal("create"));return;}
  if(interaction.isStringSelectMenu()&&id==="lanstec:work:task:select"){const t=(await listTasks(guildId,userId)).find(x=>x.id===interaction.values[0]);if(!t){await interaction.reply({content:"Tarefa não encontrada ou não pertence a você.",ephemeral:true});return;}await interaction.reply(taskDetail(t));return;}
  if(interaction.isStringSelectMenu()&&id==="lanstec:work:project:select"){const p=(await listProjects(guildId,userId)).find(x=>x.id===interaction.values[0]);if(!p){await interaction.reply({content:"Projeto não encontrado ou não pertence a você.",ephemeral:true});return;}await interaction.reply(projectDetail(p));return;}
  const taskAction=id.match(/^lanstec:work:task:(edit|status|delete):([0-9a-f-]+)$/i);
  if(interaction.isButton()&&taskAction){const [,action,taskId]=taskAction;const t=(await listTasks(guildId,userId)).find(x=>x.id===taskId);if(!t){await interaction.reply({content:"Tarefa não encontrada ou não pertence a você.",ephemeral:true});return;}
   if(action==="edit"){await interaction.showModal(taskModal("edit",t));return;}
   if(action==="status"){const next=t.status==="todo"?"doing":t.status==="doing"?"done":"todo";await updateTask(guildId,userId,t.id,{status:next});await interaction.reply(taskList(await listTasks(guildId,userId)));return;}
   await deleteTask(guildId,userId,t.id);await interaction.reply(taskList(await listTasks(guildId,userId)));return;
  }
  const projectAction=id.match(/^lanstec:work:project:(edit|status|delete):([0-9a-f-]+)$/i);
  if(interaction.isButton()&&projectAction){const [,action,projectId]=projectAction;const p=(await listProjects(guildId,userId)).find(x=>x.id===projectId);if(!p){await interaction.reply({content:"Projeto não encontrado ou não pertence a você.",ephemeral:true});return;}
   if(action==="edit"){await interaction.showModal(projectModal("edit",p));return;}
   if(action==="status"){const next=p.status==="active"?"paused":p.status==="paused"?"done":"active";await updateProject(guildId,userId,p.id,{status:next});await interaction.reply(projectList(await listProjects(guildId,userId)));return;}
   await deleteProject(guildId,userId,p.id);await interaction.reply(projectList(await listProjects(guildId,userId)));return;
  }
  const taskSubmit=id.match(/^lanstec:work:task:submit:(create|edit)(?::([0-9a-f-]+))?$/i);
  if(interaction.isModalSubmit()&&taskSubmit){const [,mode,taskId]=taskSubmit;const title=interaction.fields.getTextInputValue("title").trim(),description=interaction.fields.getTextInputValue("description").trim(),due=interaction.fields.getTextInputValue("due").trim();if(due&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(due)){await interaction.reply({content:"Prazo inválido. Use AAAA-MM-DD.",ephemeral:true});return;}
   if(mode==="create")await createTask({guildId,userId,title,description,priority:"normal",...(due ? {dueDate:due} : {})});else if(taskId){const own=(await listTasks(guildId,userId)).some(x=>x.id===taskId);if(!own){await interaction.reply({content:"Tarefa não pertence a você.",ephemeral:true});return;}await updateTask(guildId,userId,taskId,{title,description,due_date:due||null});}
   await interaction.reply(taskList(await listTasks(guildId,userId)));return;
  }
  const projectSubmit=id.match(/^lanstec:work:project:submit:(create|edit)(?::([0-9a-f-]+))?$/i);
  if(interaction.isModalSubmit()&&projectSubmit){const [,mode,projectId]=projectSubmit;const name=interaction.fields.getTextInputValue("name").trim(),description=interaction.fields.getTextInputValue("description").trim();if(mode==="create")await createProject({guildId,userId,name,description});else if(projectId){const own=(await listProjects(guildId,userId)).some(x=>x.id===projectId);if(!own){await interaction.reply({content:"Projeto não pertence a você.",ephemeral:true});return;}await updateProject(guildId,userId,projectId,{name,description});}await interaction.reply(projectList(await listProjects(guildId,userId)));return;}
 }catch(error){logger.error({err:error,feature:"workspace",userId:interaction.user.id,guildId:interaction.guildId},"Workspace interaction failed");if(interaction.isRepliable()&&!interaction.replied&&!interaction.deferred)await interaction.reply({content:"Não consegui concluir esta ação. Tente novamente.",ephemeral:true}).catch(()=>undefined);}
});
