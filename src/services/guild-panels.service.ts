import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder,
  Guild, GuildMember, Message, MessageFlags, ModalBuilder, TextInputBuilder, SectionBuilder, ThumbnailBuilder,
  TextInputStyle, TextDisplayBuilder, SeparatorBuilder, Client,
} from "discord.js";
import { logger } from "../config/logger.js";
import { getGuildRuntimeConfig, setGuildPanel, setGuildChannel } from "./guild-config.service.js";
import { PANEL_MARKERS, CHANNEL_NAMES } from "../config/guild-identifiers.js";

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
    logger.info({ guildId: guild.id, panelKey, panelName: channelName, channelId: channel.id, messageId: existing.id, action: "updated", operation: "panel_update" }, "Painel atualizado");
    await publishOperationalLog(guild, "📝 Painel atualizado", `**Painel:** ${panelKey}\n**Canal:** <#${channel.id}>\n**Mensagem:** ${existing.id}`, "update");
  } else {
    const created = await channel.send(payload);
    await setGuildPanel(guild.id, panelKey, { channelId: channel.id, messageId: created.id, customId });
    logger.info({ guildId: guild.id, panelKey, panelName: channelName, channelId: channel.id, messageId: created.id, action: "created", operation: "panel_create" }, "Painel criado");
    await publishOperationalLog(guild, "🆕 Painel criado", `**Painel:** ${panelKey}\n**Canal:** <#${channel.id}>\n**Mensagem:** ${created.id}`, "create");
  }
}

export async function publishOperationalLog(
  guild: Guild,
  title: string,
  details: string,
  kind: "create" | "update" | "delete" | "ticket" | "error" = "update",
) {
  const channel = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.name === CHANNEL_NAMES.logs,
  );
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
  await upsertPanel(guild, CHANNEL_NAMES.suggestions, PANEL_IDS.suggestions, () =>
    new ContainerBuilder().setAccentColor(ACCENT)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 💡 Central de sugestões\n**Sua ideia pode melhorar a LANSTEC.**\n\nEnvie sugestões de melhorias, novos recursos, eventos ou mudanças na comunidade. A equipe avaliará cada contribuição."))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Como funciona**\n1. Clique em *Enviar sugestão*.\n2. Descreva sua ideia com clareza.\n3. A comunidade poderá votar e a equipe acompanhará."))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("lanstec:suggestion:open").setLabel("Enviar sugestão").setEmoji("💡").setStyle(ButtonStyle.Primary),
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • PARTICIPAÇÃO DA COMUNIDADE")));
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
  await upsertPanel(guild, CHANNEL_NAMES.docs, PANEL_IDS.docs, () =>
    new ContainerBuilder().setAccentColor(0x0891b2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📚 Documentação LANSTEC\nInformações institucionais, orientações e boas práticas."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🏢", "Sobre a LANSTEC", "Tecnologia, consultoria de TI e segurança da informação com foco em confiança, responsabilidade e clareza."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("💻", "Serviços", "Consultoria de TI, orientação em segurança digital, conscientização e apoio técnico conforme escopo contratado."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🔎", "Avaliações de segurança", "Toda avaliação depende de autorização formal, escopo, limites e condições previamente acordados."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🧑‍💼", "Atendimento", "Para suporte, dúvidas ou solicitações, utilize a Central de tickets e converse diretamente com a equipe."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("🔒", "Confidencialidade", "Não compartilhe informações sensíveis em canais públicos. Dados de clientes devem ser tratados com sigilo."))
      .addSeparatorComponents(panelDivider())
      .addSectionComponents(infoSection("📄", "Documentos e contratos", "Esta documentação é informativa e não substitui propostas, contratos, políticas ou termos formais."))
      .addSeparatorComponents(panelDivider())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC • DOCUMENTAÇÃO • TECNOLOGIA COM RESPONSABILIDADE")));
}
