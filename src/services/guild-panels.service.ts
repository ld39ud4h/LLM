import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder,
  Guild, GuildMember, Message, MessageFlags, ModalBuilder, TextInputBuilder, SectionBuilder, ThumbnailBuilder,
  TextInputStyle, TextDisplayBuilder, SeparatorBuilder, Client,
} from "discord.js";
import { logger } from "../config/logger.js";
import { getGuildRuntimeConfig, setGuildPanel, setGuildChannel, patchGuildRuntimeConfig } from "./guild-config.service.js";
import { PANEL_MARKERS, CHANNEL_NAMES } from "../config/guild-identifiers.js";

const ACCENT = 0x06b6d4;
const PANEL_IDS = {
  suggestions: "PANEL:suggestions",
  support: "PANEL:support",
  tickets: "PANEL:tickets",
  rules: "PANEL:rules",
  docs: "PANEL:docs",
  work: "PANEL:work",
};

function hasCustomId(message: Message, customId: string): boolean {
  const scan = (items: any[]): boolean => items.some((item) =>
    item.customId === customId || (typeof item.content === "string" && item.content.includes(customId)) || (Array.isArray(item.components) && scan(item.components)));
  return scan(message.components.map((component) => component.toJSON() as any));
}


function normalizeComponentJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeComponentJSON);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter(key => key !== "id" && record[key] !== undefined && record[key] !== null)
        .sort()
        .map(key => [key, normalizeComponentJSON(record[key])]),
    );
  }
  return value;
}

function componentsAreEqual(current: Message, desired: ContainerBuilder): boolean {
  const currentJSON = normalizeComponentJSON(current.components.map(component => component.toJSON()));
  const desiredJSON = normalizeComponentJSON([desired.toJSON()]);
  return JSON.stringify(currentJSON) === JSON.stringify(desiredJSON);
}

function normalizeChannelName(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

async function resolvePanelChannel(guild: Guild, key: string) {
  const aliases: Record<string, string[]> = {
    suggestions: ["sugestoes", "centraldesugestoes"],
    support: ["centraldeatendimento"],
    tickets: ["abrirticket", "tickets"],
    rules: ["regras", "regraseseguranca"],
    docs: ["documentacao", "documentacaopublica"],
    work: ["tarefaseprojetos", "tarefasprojetos", "tarefaseprojetosinternas"],
  };
  const config = await getGuildRuntimeConfig(guild.id);
  const candidates = [...new Set([
    normalizeChannelName(CHANNEL_NAMES[key as keyof typeof CHANNEL_NAMES] ?? ""),
    ...(aliases[key] ?? []),
  ].filter(Boolean))];
  const setupEntries = Object.entries(config.setup?.channelIds ?? {});
  const persistedId = config.channels?.[key] ?? config.setup?.channelIds?.[key]
    ?? setupEntries.find(([name]) => {
      const normalized = normalizeChannelName(name);
      return candidates.some(alias => normalized === alias || normalized.endsWith(alias) || alias.endsWith(normalized));
    })?.[1];
  if (persistedId) {
    const cached = guild.channels.cache.get(persistedId);
    if (cached) return cached;
    const fetched = await guild.channels.fetch(persistedId).catch(() => null);
    if (fetched) return fetched;
    logger.warn({ guildId: guild.id, key, persistedId }, "Persisted panel channel ID could not be fetched; falling back to channel name");
  }
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  return [...channels.values()].find(channel => {
    if (!channel) return false;
    const normalized = normalizeChannelName(channel.name);
    return candidates.some(alias => normalized === alias || normalized.endsWith(alias) || alias.endsWith(normalized));
  });
}

async function upsertPanel(guild: Guild, channelName: string, customId: string, build: () => ContainerBuilder) {
  try {
  const panelKey = customId.replace("PANEL:", "");
  const channel = await resolvePanelChannel(guild, panelKey);
  if (!channel) {
    logger.warn({ guildId: guild.id, channelName, panelKey }, "Panel destination not found; setup must create its channel");
    return;
  }
  const config = await getGuildRuntimeConfig(guild.id);
  const saved = config.panels?.[panelKey];
  const desired = build();
  const payload = { components: [desired], flags: [MessageFlags.IsComponentsV2] as const };

  // Forum panels are persistent starter posts; text panels are regular messages.
  if (channel.type === ChannelType.GuildForum) {
    const forum = channel;
    const active = await forum.threads.fetchActive();
    let thread = active.threads.find(item => item.name === "📌・Central de sugestões");
    if (!thread) {
      const archived = await forum.threads.fetchArchived({ type: "public" });
      thread = archived.threads.find(item => item.name === "📌・Central de sugestões");
      if (thread) await thread.setArchived(false);
    }
    let existing: Message<boolean> | null | undefined;
    if (thread) existing = await thread.fetchStarterMessage().catch(() => undefined);
    if (existing && existing.author.id !== guild.client.user?.id) existing = undefined;
    if (!existing) {
      thread = undefined;
      const createdThread = await forum.threads.create({
        name: "📌・Central de sugestões",
        message: payload,
        reason: "Publicação/verificação do painel persistente LANSTEC",
      });
      existing = (await createdThread.fetchStarterMessage().catch(() => undefined)) ?? undefined;
      thread = createdThread;
    } else if (!componentsAreEqual(existing, desired)) {
      await existing.edit(payload);
      logger.info({ guildId: guild.id, panelKey, channelId: forum.id, threadId: thread?.id, messageId: existing.id, action: "updated", operation: "panel_update" }, "Painel de fórum atualizado");
      await publishOperationalLog(guild, "📝 Painel atualizado", `**Painel:** ${panelKey}\n**Canal:** <#${forum.id}>\n**Post:** <#${thread?.id}>\n**Mensagem:** ${existing.id}`, "update");
    }
    if (existing && thread) {
      await setGuildPanel(guild.id, panelKey, { channelId: forum.id, messageId: existing.id, customId });
      if (thread.name !== "📌・Central de sugestões") await thread.setName("📌・Central de sugestões");
    }
    return;
  }

  if (channel.type !== ChannelType.GuildText || !channel.isTextBased() || !("messages" in channel)) {
    logger.warn({ guildId: guild.id, panelKey, channelId: channel.id, type: channel.type }, "Unsupported panel channel type");
    return;
  }
  let existing: Message | undefined;
  if (saved?.channelId === channel.id && saved.messageId) {
    existing = await channel.messages.fetch(saved.messageId).catch(() => undefined);
    if (existing && existing.author.id !== guild.client.user?.id) existing = undefined;
  }
  if (!existing) {
    const recent = await channel.messages.fetch({ limit: 100 });
    existing = recent.find(message => message.author.id === guild.client.user?.id && hasCustomId(message, customId));
  }
  if (existing) {
    if (componentsAreEqual(existing, desired)) {
      await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: existing.id, customId });
      logger.debug({ guildId: guild.id, panelKey, channelId: channel.id, messageId: existing.id, action: "unchanged", operation: "panel_sync" }, "Painel já está atualizado; nenhuma alteração necessária");
      return;
    }
    await existing.edit(payload);
    await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: existing.id, customId });
    logger.info({ guildId: guild.id, panelKey, panelName: channel.name, channelId: channel.id, messageId: existing.id, action: "updated", operation: "panel_update" }, "Painel atualizado");
    await publishOperationalLog(guild, "📝 Painel atualizado", `**Painel:** ${panelKey}\n**Canal:** <#${channel.id}>\n**Mensagem:** ${existing.id}`, "update");
  } else {
    const created = await channel.send(payload);
    await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: created.id, customId });
    logger.info({ guildId: guild.id, panelKey, panelName: channel.name, channelId: channel.id, messageId: created.id, action: "created", operation: "panel_create" }, "Painel criado");
    await publishOperationalLog(guild, "🆕 Painel criado", `**Painel:** ${panelKey}\n**Canal:** <#${channel.id}>\n**Mensagem:** ${created.id}`, "create");
  }
  } catch (error) {
    logger.error({ err: error, guildId: guild.id, panelKey: customId.replace("PANEL:", ""), channelName, feature: "panels" }, "Panel sync failed; other panels will continue");
  }
}

export async function publishOperationalLog(
  guild: Guild,
  title: string,
  details: string,
  kind: "create" | "update" | "delete" | "ticket" | "error" = "update",
) {
  const logName = normalizeChannelName(CHANNEL_NAMES.logs);
  const channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (normalizeChannelName(c.name) === logName || normalizeChannelName(c.name).endsWith(logName)));
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;
  const colors = { create: 0x16a34a, update: 0x0891b2, delete: 0xdc2626, ticket: 0x7c3aed, error: 0xef4444 };
  const card = new ContainerBuilder().setAccentColor(colors[kind])
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# " + title))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • AUDITORIA • " + new Date().toLocaleString("pt-BR")));
  await channel.send({
    components: [card],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  }).catch(error => logger.warn({ err: error, guildId: guild.id, feature: "operational-log" }, "Could not publish operational log"));
}

function infoSection(emoji: string, heading: string, body: string) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji} ${heading}**\n${body}`))
    .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: `https://cdn.jsdelivr.net/npm/twemoji@15.1.0/assets/72x72/${Array.from(emoji).map(char => char.codePointAt(0)!.toString(16)).filter(code => code !== "fe0f").join("-")}.png` }, description: heading }));
}
function panelDivider() {
  return new SeparatorBuilder().setDivider(true).setSpacing(2);
}

export async function publishGuildPanels(guild: Guild) {
  // Remove the retired suggestions panel from its old destination and runtime config.
  const previous = await getGuildRuntimeConfig(guild.id);
  const oldSuggestion = previous.panels?.suggestions;
  if (oldSuggestion) {
    const oldChannel = guild.channels.cache.get(oldSuggestion.channelId);
    if (oldChannel && oldChannel.isTextBased() && "messages" in oldChannel) {
      const oldMessage = await oldChannel.messages.fetch(oldSuggestion.messageId).catch(() => undefined);
      if (oldMessage?.author.id === guild.client.user?.id) {
        await oldMessage.delete().catch(error => logger.warn({ err: error, guildId: guild.id }, "Could not remove retired suggestions panel"));
      }
    }
    const panels = { ...(previous.panels ?? {}) };
    delete panels.suggestions;
    await patchGuildRuntimeConfig(guild.id, { panels });
  }
  await upsertPanel(guild, CHANNEL_NAMES.support, PANEL_IDS.support, () =>
    new ContainerBuilder().setAccentColor(0x0f766e)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🛟 Central de atendimento\nPrecisa de ajuda? Abra uma solicitação para a equipe LANSTEC.\n\n**Antes de abrir:** não publique senhas, tokens, dados pessoais ou informações confidenciais em canais públicos."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("Selecione o tipo de atendimento e informe o que precisa. A equipe fará o encaminhamento adequado."))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:support:open").setLabel("Solicitar atendimento").setEmoji("🎫").setStyle(ButtonStyle.Success),
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • SUPORTE E RELACIONAMENTO")));
  await upsertPanel(guild, CHANNEL_NAMES.tickets, PANEL_IDS.tickets, () =>
    new ContainerBuilder().setAccentColor(0x2563eb)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Central de tickets\nAbra um atendimento privado com a equipe. Não compartilhe senhas ou tokens.\n-# LANSTEC • ATENDIMENTO PRIVADO"))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:ticket:open").setLabel("Abrir ticket privado").setEmoji("🎫").setStyle(ButtonStyle.Primary),
      )));
  await upsertPanel(guild, CHANNEL_NAMES.rules, PANEL_IDS.rules, () =>
    new ContainerBuilder().setAccentColor(0xf59e0b)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📜 Regras e segurança\nUma comunidade segura começa com atitudes responsáveis."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🤝", "Respeito e convivência", "Trate todos com cordialidade. Não toleramos assédio, discriminação, ameaças ou perseguição."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🔐", "Privacidade e dados", "Não publique senhas, tokens, documentos, dados pessoais ou informações confidenciais de clientes."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🛡️", "Segurança e autorização", "Testes, scans e avaliações de segurança somente com autorização expressa e escopo definido."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🚫", "Conteúdo proibido", "Sem spam, golpes, phishing, malware, links maliciosos ou divulgação de conteúdo ilegal."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🧭", "Organização", "Utilize cada canal conforme sua finalidade e mantenha conversas técnicas claras e construtivas."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("📣", "Denúncias e moderação", "Se identificar um problema, procure a equipe ou abra um ticket privado."))
      .addSeparatorComponents(panelDivider())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • COMUNIDADE SEGURA • RESPEITO, ÉTICA E RESPONSABILIDADE")));
  await upsertPanel(guild, CHANNEL_NAMES.work, "PANEL:work", () =>
    new ContainerBuilder().setAccentColor(0x7c3aed)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🗂️ Tarefas e projetos\nOrganize suas atividades e acompanhe seus projetos em um espaço privado."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Seu espaço pessoal**\nCrie tarefas, acompanhe status e prazos, e mantenha seus projetos organizados. Cada pessoa acessa somente seus próprios registros."))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:work:open").setLabel("Abrir meu espaço de trabalho").setEmoji("🗂️").setStyle(ButtonStyle.Primary),
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • ORGANIZAÇÃO E PRODUTIVIDADE")));
  await upsertPanel(guild, CHANNEL_NAMES.docs, PANEL_IDS.docs, () =>
    new ContainerBuilder().setAccentColor(0x0891b2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📚 Documentação LANSTEC\\nInformações institucionais, orientações e boas práticas."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🏢", "Sobre e serviços", "Consultoria de TI e segurança da informação com foco em confiança, responsabilidade e clareza. Apoio técnico e conscientização conforme escopo contratado."))
      .addSectionComponents(infoSection("🔎", "Avaliações de segurança", "Toda avaliação depende de autorização formal, escopo, limites e condições previamente acordados."))
      .addSectionComponents(infoSection("🧑‍💼", "Atendimento e sigilo", "Para suporte, utilize a Central de tickets. Não compartilhe senhas, tokens ou dados sensíveis em canais públicos."))
      .addSectionComponents(infoSection("📄", "Documentos e contratos", "Conteúdo informativo; não substitui propostas, contratos, políticas ou termos formais."))
      .addSeparatorComponents(panelDivider())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • DOCUMENTAÇÃO • TECNOLOGIA COM RESPONSABILIDADE")));
}


export function buildSuggestionModal() {
  return new ModalBuilder().setCustomId("lanstec:suggestion:submit").setTitle("Enviar sugestão")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Título da sugestão").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Explique sua ideia").setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true)),
    );
}

export function buildSupportModal() {
  return new ModalBuilder().setCustomId("lanstec:support:submit").setTitle("Solicitar atendimento")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("subject").setLabel("Assunto").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("details").setLabel("Descreva o que precisa (sem senhas)").setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true)),
    );
}

export async function publishSuggestion(guild: Guild, userId: string, title: string, description: string) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNEL_NAMES.suggestions);
  if (!channel) throw new Error("Canal de sugestões não encontrado.");
  const card = new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 💡 " + title))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Enviado por <@" + userId + "> • " + new Date().toLocaleDateString("pt-BR")))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("lanstec:suggestion:vote:up").setLabel("Apoiar").setEmoji("👍").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("lanstec:suggestion:vote:down").setLabel("Não apoiar").setEmoji("👎").setStyle(ButtonStyle.Secondary),
    ));
  const payload = { components: [card], flags: [MessageFlags.IsComponentsV2] as const, allowedMentions: { users: [] as string[] } };
  if (channel.type === ChannelType.GuildForum) {
    await channel.threads.create({ name: title.slice(0, 100), message: payload, reason: "Nova sugestão da comunidade" });
    return;
  }
  if (channel.isTextBased() && "send" in channel) {
    await channel.send(payload);
    return;
  }
  throw new Error("O canal de sugestões precisa ser Fórum ou texto.");
}

export async function publishSupportRequest(guild: Guild, member: GuildMember, subject: string, details: string) {
  const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL_NAMES.support);
  if (!channel || !channel.isTextBased() || !("send" in channel)) throw new Error("Canal de atendimento não encontrado.");
  const card = new ContainerBuilder().setAccentColor(0x0f766e)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Solicitação de atendimento"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("**" + subject + "**\n" + details))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Solicitante: <@" + member.id + "> • " + new Date().toLocaleString("pt-BR")));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [] } });
}

export async function sendWelcome(member: GuildMember) {
  const channel = member.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL_NAMES.welcome);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;
  const channelId = (name: string) => member.guild.channels.cache.find(c => c.name === name || c.name.endsWith("・" + name))?.id ?? "";
  const card = new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ✦ Bem-vindo(a) à LANSTEC Tecnologia"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Olá, <@" + member.id + ">! Que bom ter você por aqui.\n\nSomos uma comunidade de tecnologia, inovação e segurança digital."))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Comece por aqui**\n• Leia <#" + channelId(CHANNEL_NAMES.rules) + ">.\n• Conheça os <#" + channelId(CHANNEL_NAMES.announcements) + ">.\n• Converse em <#" + channelId(CHANNEL_NAMES.general) + ">.\n• Compartilhe ideias em <#" + channelId(CHANNEL_NAMES.suggestions) + ">. "))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Mantenha seus dados e credenciais sempre protegidos."));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [member.id] } });
}

export async function initializeGuildPanels(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.channels.fetch();
      logger.info({ guildId: guild.id, channelCount: guild.channels.cache.size, feature: "panels" }, "Guild channels loaded; starting panel synchronization");
      await publishGuildPanels(guild); logger.info({ guildId: guild.id, feature: "panels" }, "Persistent panels synchronized");
    } catch (error) { logger.error({ err: error, guildId: guild.id, feature: "panels" }, "Panel initialization failed"); }
  }
}

export function buildTicketModal() {
  return new ModalBuilder().setCustomId("lanstec:ticket:submit").setTitle("Abrir ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("subject").setLabel("Assunto").setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("details").setLabel("Descreva sua solicitação").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)),
    );
}

export async function createPrivateTicket(guild: Guild, member: GuildMember, subject: string, details: string, parentChannelId?: string) {
  const parent = parentChannelId ? guild.channels.cache.get(parentChannelId) : guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === CHANNEL_NAMES.tickets);
  if (!parent || parent.type !== ChannelType.GuildText) throw new Error("Canal de texto pai para tópicos privados não encontrado.");
  const safeName = subject.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 35).replace(/^-|-$/g, "") || "atendimento";
  const thread = await parent.threads.create({ name: "🎫-" + safeName + "-" + (member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "cliente"), type: ChannelType.PrivateThread, autoArchiveDuration: 1440, invitable: false, reason: "Ticket privado LANSTEC" });
  await thread.members.add(member.id);
  const staffRoleNames = ["Administrador", "Gerente", "Suporte técnico", "Coordenador técnico"];
  const staffRoles = guild.roles.cache.filter(role => staffRoleNames.includes(role.name));
  const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
  for (const staff of allMembers.filter(m => m.roles.cache.some(role => staffRoles.has(role.id))).values()) {
    if (staff.id !== member.id) await thread.members.add(staff.id).catch(error => logger.warn({ err: error, userId: staff.id, threadId: thread.id }, "Could not add staff to ticket"));
  }
  const card = new ContainerBuilder().setAccentColor(0x2563eb)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Ticket aberto\n**Assunto:** " + subject))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Solicitante: <@" + member.id + ">\nA equipe responderá neste tópico privado. Não envie senhas ou tokens."))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("lanstec:ticket:claim").setLabel("Assumir").setEmoji("🧑‍💻").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("lanstec:ticket:close").setLabel("Encerrar").setEmoji("🔒").setStyle(ButtonStyle.Danger)));
  await thread.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [member.id] } });
  logger.info({ guildId: guild.id, ticketId: thread.id, requesterId: member.id, parentChannelId: parent.id, operation: "ticket_create" }, "Ticket privado criado");
  await publishOperationalLog(guild, "🎫 Ticket aberto", "**Solicitante:** <@" + member.id + ">\n**Assunto:** " + subject + "\n**Tópico:** <#" + thread.id + ">", "ticket");
  return thread;
}
