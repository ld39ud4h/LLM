import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder,
  Guild, GuildMember, Message, MessageFlags, ModalBuilder, TextInputBuilder,
  TextInputStyle, TextDisplayBuilder, SeparatorBuilder, Client,
} from "discord.js";
import { logger } from "../config/logger.js";
import { getGuildRuntimeConfig, setGuildPanel } from "./guild-config.service.js";

const ACCENT = 0x06b6d4;
const PANEL_IDS = {
  suggestions: "PANEL:suggestions",
  support: "PANEL:support",
  tickets: "PANEL:tickets",
  rules: "PANEL:rules",
  docs: "PANEL:docs",
};

function hasCustomId(message: Message, customId: string): boolean {
  const scan = (items: any[]): boolean => items.some((item) =>
    item.customId === customId || (typeof item.content === "string" && item.content.includes(customId)) || (Array.isArray(item.components) && scan(item.components)));
  return scan(message.components.map((component) => component.toJSON() as any));
}

async function upsertPanel(guild: Guild, channelName: string, customId: string, build: () => ContainerBuilder) {
  const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === channelName);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    logger.warn({ guildId: guild.id, channelName }, "Panel channel not found; run /setup_lanstec first");
    return;
  }
  const panelKey = customId.replace("PANEL:", "");
  const config = await getGuildRuntimeConfig(guild.id);
  const saved = config.panels?.[panelKey];
  const payload = { components: [build()], flags: [MessageFlags.IsComponentsV2] as const };
  let existing: Message | undefined;
  if (saved?.channelId === channel.id && saved.messageId) {
    existing = await channel.messages.fetch(saved.messageId).catch(() => undefined);
    if (existing && existing.author.id !== guild.client.user?.id) existing = undefined;
  }
  if (!existing) {
    const recent = await channel.messages.fetch({ limit: 100 });
    existing = recent.find((message) => message.author.id === guild.client.user?.id && hasCustomId(message, customId));
  }
  if (existing) {
    await existing.edit(payload);
    await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: existing.id, customId });
    logger.info({ guildId: guild.id, panelKey, channelId: channel.id, messageId: existing.id, action: "updated" }, "Guild panel reconciled");
  } else {
    const created = await channel.send(payload);
    await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: created.id, customId });
    logger.info({ guildId: guild.id, panelKey, channelId: channel.id, messageId: created.id, action: "created" }, "Guild panel reconciled");
  }
}

export async function publishGuildPanels(guild: Guild) {
  await upsertPanel(guild, "sugestoes", PANEL_IDS.suggestions, () =>
    new ContainerBuilder().setAccentColor(ACCENT)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 💡 Central de sugestões\n**Sua ideia pode melhorar a LANSTEC.**\n\nEnvie sugestões de melhorias, novos recursos, eventos ou mudanças na comunidade. A equipe avaliará cada contribuição."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Como funciona**\n1. Clique em *Enviar sugestão*.\n2. Descreva sua ideia com clareza.\n3. A comunidade poderá votar e a equipe acompanhará."))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:suggestion:open").setLabel("Enviar sugestão").setEmoji("💡").setStyle(ButtonStyle.Primary),
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • PARTICIPAÇÃO DA COMUNIDADE • PANEL:suggestions")));
  await upsertPanel(guild, "central-de-atendimento", PANEL_IDS.support, () =>
    new ContainerBuilder().setAccentColor(0x0f766e)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🛟 Central de atendimento\nPrecisa de ajuda? Abra uma solicitação para a equipe LANSTEC.\n\n**Antes de abrir:** não publique senhas, tokens, dados pessoais ou informações confidenciais em canais públicos."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("Selecione o tipo de atendimento e informe o que precisa. A equipe fará o encaminhamento adequado."))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:support:open").setLabel("Solicitar atendimento").setEmoji("🎫").setStyle(ButtonStyle.Success),
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • SUPORTE E RELACIONAMENTO • PANEL:support")));
  await upsertPanel(guild, "abrir-ticket", PANEL_IDS.tickets, () =>
    new ContainerBuilder().setAccentColor(0x2563eb)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Central de tickets\\nAbra um atendimento privado com a equipe. Não compartilhe senhas ou tokens.\\n-# PANEL:tickets"))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:ticket:open").setLabel("Abrir ticket privado").setEmoji("🎫").setStyle(ButtonStyle.Primary),
      )));
  await upsertPanel(guild, "regras-e-seguranca", PANEL_IDS.rules, () =>
    new ContainerBuilder().setAccentColor(0xf59e0b)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📜 Regras e segurança\\n**1. Respeito:** cordialidade.\\n**2. Privacidade:** não publique dados pessoais, credenciais ou informações de clientes.\\n**3. Segurança:** testes somente com autorização e escopo definido.\\n**4. Conteúdo:** sem spam, golpes ou malware.\\n**5. Organização:** use os canais corretamente.\\n**6. Denúncias:** procure a moderação ou abra ticket.\\n-# PANEL:rules")));
  await upsertPanel(guild, "documentacao-publica", PANEL_IDS.docs, () =>
    new ContainerBuilder().setAccentColor(0x0891b2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📚 Documentação pública LANSTEC\\n**Serviços:** consultoria de TI, segurança da informação e conscientização.\\n**Avaliações:** somente com autorização e escopo acordado.\\n**Atendimento:** abra ticket para suporte.\\n**Privacidade:** não compartilhe dados sensíveis em canais públicos.\\n\\nEsta documentação não substitui contratos, propostas ou políticas formais.\\n-# PANEL:docs")));
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
  const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === "sugestoes");
  if (!channel || !channel.isTextBased() || !("send" in channel)) throw new Error("Canal #sugestoes não encontrado.");
  const card = new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 💡 " + title))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Enviado por <@" + userId + "> • " + new Date().toLocaleDateString("pt-BR")))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("lanstec:suggestion:vote:up").setLabel("Apoiar").setEmoji("👍").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("lanstec:suggestion:vote:down").setLabel("Não apoiar").setEmoji("👎").setStyle(ButtonStyle.Secondary),
    ));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [] } });
}

export async function publishSupportRequest(guild: Guild, member: GuildMember, subject: string, details: string) {
  const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === "central-de-atendimento");
  if (!channel || !channel.isTextBased() || !("send" in channel)) throw new Error("Canal de atendimento não encontrado.");
  const card = new ContainerBuilder().setAccentColor(0x0f766e)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Solicitação de atendimento"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("**" + subject + "**\n" + details))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Solicitante: <@" + member.id + "> • " + new Date().toLocaleString("pt-BR")));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [] } });
}

export async function sendWelcome(member: GuildMember) {
  const channel = member.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === "boas-vindas");
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;
  const card = new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ✦ Bem-vindo(a) à LANSTEC Tecnologia"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Olá, <@" + member.id + ">! Que bom ter você por aqui.\n\nSomos uma comunidade de tecnologia, inovação e segurança digital."))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Comece por aqui**\n• Leia <#"+(member.guild.channels.cache.find(c=>c.name==="regras-e-seguranca")?.id ?? "")+">.\n• Conheça os <#"+(member.guild.channels.cache.find(c=>c.name==="anuncios")?.id ?? "")+">.\n• Converse em <#"+(member.guild.channels.cache.find(c=>c.name==="bate-papo")?.id ?? "")+">.\n• Compartilhe ideias em <#"+(member.guild.channels.cache.find(c=>c.name==="sugestoes")?.id ?? "")+">."))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Mantenha seus dados e credenciais sempre protegidos."));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [member.id] } });
}

export async function initializeGuildPanels(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    try { await publishGuildPanels(guild); logger.info({ guildId: guild.id, feature: "panels" }, "Persistent panels synchronized"); }
    catch (error) { logger.error({ err: error, guildId: guild.id, feature: "panels" }, "Panel initialization failed"); }
  }
}

export function buildTicketModal() {
  return new ModalBuilder().setCustomId("lanstec:ticket:submit").setTitle("Abrir ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("subject").setLabel("Assunto").setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("details").setLabel("Descreva sua solicitação").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)),
    );
}

export async function createPrivateTicket(guild: Guild, member: GuildMember, subject: string, details: string) {
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === "🤝 LANSTEC | CLIENTES");
  const staffNames = ["Administrador", "Gerente", "Suporte técnico", "Coordenador técnico"];
  const overwrites: any[] = [
    { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
    { id: member.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"] },
    ...(guild.client.user ? [{ id: guild.client.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }] : []),
  ];
  for (const name of staffNames) {
    const role = guild.roles.cache.find(r => r.name === name);
    if (role) overwrites.push({ id: role.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] });
  }
  const safeName = subject.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 25).replace(/^-|-$/g, "") || "atendimento";
  const channel = await guild.channels.create({ name: `ticket-${safeName}-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5)}`, type: ChannelType.GuildText, parent: category?.id ?? null, permissionOverwrites: overwrites, reason: "Ticket privado LANSTEC" });
  const card = new ContainerBuilder().setAccentColor(0x2563eb)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎫 Ticket aberto\\n**Assunto:** " + subject))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Solicitante: <@" + member.id + ">\\nA equipe responderá neste canal. Não envie senhas ou tokens."))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("lanstec:ticket:claim").setLabel("Assumir").setEmoji("🧑‍💻").setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId("lanstec:ticket:close").setLabel("Encerrar").setEmoji("🔒").setStyle(ButtonStyle.Danger)));
  await channel.send({ components: [card], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [member.id] } });
  return channel;
}
