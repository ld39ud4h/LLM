import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Guild,
  Role,
  CategoryChannel,
  GuildBasedChannel,
  OverwriteResolvable, ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags,
} from "discord.js";
import { getGuildRuntimeConfig, patchGuildRuntimeConfig } from "../services/guild-config.service.js";
import { publishGuildPanels, publishOperationalLog } from "../services/guild-panels.service.js";

const roleDefinitions = [
  { name: "Administrador", color: 0x0f766e, permissions: [PermissionFlagsBits.Administrator] },
  { name: "Gerente", color: 0x2563eb },
  { name: "Coordenador técnico", color: 0x0891b2 },
  { name: "Analista de cibersegurança", color: 0x0d9488 },
  { name: "Desenvolvedor", color: 0x7c3aed },
  { name: "Suporte técnico", color: 0x0284c7 },
  { name: "Assistente administrativo", color: 0x64748b },
  { name: "Estagiário / aprendiz", color: 0x65a30d },
  { name: "Cliente", color: 0x16a34a },
  { name: "Parceiro comercial", color: 0xd97706 },
  { name: "Membro da comunidade", color: 0x9333ea },
  { name: "Visitante", color: 0x94a3b8 },
  { name: "Bot / sistemas", color: 0x334155 },
];

const roleChannelGroups = {
  staff: ["Administrador", "Gerente", "Coordenador técnico", "Analista de cibersegurança", "Desenvolvedor", "Suporte técnico", "Assistente administrativo", "Estagiário / aprendiz"],
  technical: ["Administrador", "Coordenador técnico", "Analista de cibersegurança", "Desenvolvedor", "Suporte técnico"],
  clients: ["Administrador", "Gerente", "Suporte técnico", "Cliente"],
  admin: ["Administrador"],
};

type GroupKey = keyof typeof roleChannelGroups;
type ChannelKind =
  | ChannelType.GuildText
  | ChannelType.GuildVoice
  | ChannelType.GuildAnnouncement
  | ChannelType.GuildForum
  | ChannelType.GuildStageVoice;

type ChannelDefinition = { name: string; type?: ChannelKind; topic?: string };
const groups: Array<{ name: string; privacy: "public" | GroupKey; channels: ChannelDefinition[] }> = [
  {
    name: "📍・INÍCIO",
    privacy: "public",
    channels: [
      { name: "👋・boas-vindas", topic: "Boas-vindas à LANSTEC Tecnologia." },
      { name: "📜・regras", topic: "Regras, privacidade e segurança da comunidade." },
      { name: "📢・anúncios", type: ChannelType.GuildAnnouncement, topic: "Comunicados oficiais da LANSTEC." },
      { name: "📚・documentação", topic: "Materiais, orientações e documentação pública." },
      { name: "🛡️・segurança", topic: "Orientações de segurança digital e boas práticas." },
    ],
  },
  {
    name: "🏢・EMPRESA",
    privacy: "staff",
    channels: [
      { name: "💬・comunicação-interna" },
      { name: "📊・gestão-e-planejamento" },
      { name: "🗂️・tarefas-e-projetos", topic: "Acompanhamento de tarefas e projetos internos." },
      { name: "📝・atas-e-reuniões", topic: "Registros e pautas de reuniões." },
      { name: "🔊・reuniões", type: ChannelType.GuildVoice },
    ],
  },
  {
    name: "🧪・CYBER LAB",
    privacy: "technical",
    channels: [
      { name: "💻・laboratório", topic: "Discussões e experimentos técnicos autorizados." },
      { name: "📡・monitoramento", topic: "Monitoramento e observabilidade dos sistemas." },
      { name: "🚨・alertas-de-segurança", topic: "Alertas de segurança e eventos que exigem triagem." },
      { name: "📖・documentação-técnica", topic: "Runbooks, procedimentos e documentação técnica." },
      { name: "🧩・incidentes", topic: "Triagem, investigação e acompanhamento de incidentes." },
    ],
  },
  {
    name: "🤝・CLIENTES",
    privacy: "clients",
    channels: [
      { name: "🧭・central-de-atendimento", topic: "Orientações e encaminhamento de suporte." },
      { name: "🎫・abrir-ticket", topic: "Use o painel abaixo para abrir um atendimento privado." },
      { name: "📣・avisos-aos-clientes", type: ChannelType.GuildAnnouncement, topic: "Comunicados operacionais destinados aos clientes." },
    ],
  },
  {
    name: "🌐・COMUNIDADE",
    privacy: "public",
    channels: [
      { name: "💬・chat-geral", topic: "Converse livremente com a comunidade." },
      { name: "☕・bate-papo", topic: "Conversas descontraídas e assuntos diversos." },
      { name: "💡・sugestões", type: ChannelType.GuildForum, topic: "Publique uma sugestão por postagem; a comunidade pode votar e comentar." },
      { name: "🧠・tecnologia-e-inovação", type: ChannelType.GuildForum, topic: "Compartilhe dúvidas, descobertas e discussões sobre tecnologia." },
      { name: "🐛・reportar-problema", type: ChannelType.GuildForum, topic: "Cada publicação deve descrever um problema diferente." },
      { name: "📸・divulgação", topic: "Compartilhe projetos, portfólios e iniciativas respeitando as regras." },
    ],
  },
  {
    name: "🤖・SISTEMAS",
    privacy: "admin",
    channels: [
      { name: "⚙️・comandos-do-bot" },
      { name: "📋・logs-do-bot", topic: "Logs operacionais, erros e diagnósticos do bot." },
      { name: "📈・status-e-alertas", topic: "Inicialização, disponibilidade e status de execução." },
    ],
  },
  {
    name: "🔊・CONVÍVIO",
    privacy: "public",
    channels: [
      { name: "🔊・sala-geral", type: ChannelType.GuildVoice },
      { name: "🎮・jogos", type: ChannelType.GuildVoice },
      { name: "🎙️・palco-da-comunidade", type: ChannelType.GuildStageVoice },
    ],
  },
];

async function ensureRole(guild: Guild, definition: (typeof roleDefinitions)[number]): Promise<Role> {
  const existing = guild.roles.cache.find((role) => role.name === definition.name);
  if (existing) {
    const permissionsMatch = definition.permissions ? existing.permissions.bitfield === definition.permissions.reduce((bits, permission) => bits | permission, 0n) : true;
    if (existing.color !== definition.color || !permissionsMatch) {\n      await existing.edit({ color: definition.color, ...(definition.permissions ? { permissions: definition.permissions } : {}), reason: "Sincronização de cargo LANSTEC" });\n    }
    return existing;
  }
  return guild.roles.create({
    name: definition.name,
    color: definition.color,
    permissions: definition.permissions ?? [],
    reason: "Configuração inicial LANSTEC Tecnologia",
  });
}

async function ensureCategory(guild: Guild, name: string, overwrites: OverwriteResolvable[]): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (channel): channel is CategoryChannel => channel.type === ChannelType.GuildCategory && channel.name === name,
  );
  if (existing) {
    await existing.permissionOverwrites.set(overwrites, "Sincronização de permissões LANSTEC");
    return existing;
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: "Configuração inicial LANSTEC Tecnologia",
  });
}

async function ensureChannel(guild: Guild, category: CategoryChannel, definition: ChannelDefinition): Promise<GuildBasedChannel> {
  const requestedType = definition.type ?? ChannelType.GuildText;
  // Announcement and Stage channels require Community; use ordinary text/voice otherwise.
  const communityEnabled = guild.features.includes("COMMUNITY");
  const type = requestedType === ChannelType.GuildAnnouncement && !guild.features.includes("NEWS")
    ? ChannelType.GuildText
    : requestedType === ChannelType.GuildStageVoice && !communityEnabled
      ? ChannelType.GuildVoice
      : requestedType;
  const existing = guild.channels.cache.find(
    (channel) => channel.parentId === category.id && channel.name === definition.name
      && (channel.type === type || (requestedType === ChannelType.GuildAnnouncement && channel.type === ChannelType.GuildText)),
  );
  if (existing) {
    if (requestedType === ChannelType.GuildAnnouncement && type === ChannelType.GuildAnnouncement && existing.type === ChannelType.GuildText) {
      const converted = await existing.setType(ChannelType.GuildAnnouncement, "Conversão automática para canal de anúncios LANSTEC");
      if (definition.topic) await converted.setTopic(definition.topic);
      return converted;
    }
    if ("setTopic" in existing && definition.topic && "topic" in existing && existing.topic !== definition.topic) await existing.setTopic(definition.topic);
    return existing;
  }
  return guild.channels.create({
    name: definition.name,
    type,
    parent: category.id,
    ...(type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement || type === ChannelType.GuildForum
      ? (definition.topic ? { topic: definition.topic } : {}) : {}),
    reason: "Configuração inicial LANSTEC",
  });
}

export const setupLanstecCommand = {
  data: new SlashCommandBuilder()
    .setName("setup_lanstec")
    .setDescription("Cria/sincroniza ou recria a estrutura LANSTEC.")
    .addStringOption((option) =>
      option
        .setName("modo")
        .setDescription("Vazio = sincronizar sem apagar; reset = recriar; resetchatsonly = recriar canais")
        .addChoices(
          { name: "Reset integral (preserva cargos administrativos)", value: "reset" },
          { name: "Reset somente canais (preserva todos os cargos)", value: "resetchatsonly" },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Somente em servidor.", ephemeral: true });
      return;
    }

    const mode = interaction.options.getString("modo") ?? "sync";
    const reset = mode === "reset";
    const resetChatsOnly = mode === "resetchatsonly";
    await interaction.deferReply({ ephemeral: true });

    if (reset || resetChatsOnly) {
      const confirmationText = resetChatsOnly
        ? "# ⚠️ Resetchatsonly\n**Todos os canais e categorias serão excluídos**"
        : "# ⚠️ Reset\\n**Todos os canais e categorias serão excluídos**, inclusive os que não são LANSTEC. Cargos administrativos (Administrador/Gerente e cargos com permissão Administrator), membros e @everyone serão preservados. Outros cargos personalizados poderão ser removidos. Cargos gerenciados por integrações não podem ser removidos.";
      const panel = new ContainerBuilder()
        .setAccentColor(0xdc2626)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(confirmationText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true)
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("setup-lanstec-reset-confirm")
              .setLabel("Apagar canais e recriar")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("setup-lanstec-reset-cancel")
              .setLabel("Cancelar")
              .setStyle(ButtonStyle.Secondary),
          ),
        );

      const message = await interaction.followUp({
        components: [panel],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });

      try {
        const component = await message.awaitMessageComponent({
          time: 60_000,
          filter: (candidate) =>
            candidate.user.id === interaction.user.id &&
            candidate.customId.startsWith("setup-lanstec-reset-"),
        });
        if (component.customId.endsWith("cancel")) {
          await component.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("🟢 **Reset cancelado.** Nenhuma alteração foi realizada."))] });
          await interaction.editReply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("🟢 **Reset cancelado.** Nenhuma alteração foi realizada.")),], flags: MessageFlags.IsComponentsV2 });
          return;
        }
        await component.deferUpdate();
      } catch {
        await interaction.editReply({
          components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("⌛ **Confirmação expirada.** Nada foi apagado."))],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      await interaction.editReply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("🧹 **Apagando estrutura…**\\nPreparando canais e cargos."))], flags: MessageFlags.IsComponentsV2 });

      for (const channel of [...guild.channels.cache.values()]) {
        try {
          await channel.delete(
            resetChatsOnly ? "Reset somente canais /setup_lanstec" : "Reset /setup_lanstec",
          );
        } catch (error) {
          console.warn("Falha ao excluir canal no reset", { error, id: channel.id });
        }
      }

      if (reset) {
        const botMember = await guild.members.fetchMe();
        const sortedRoles = [...guild.roles.cache.values()].sort(
          (a, b) => b.position - a.position,
        );
        for (const role of sortedRoles) {
          const administrative =
            role.permissions.has(PermissionFlagsBits.Administrator) ||
            ["Administrador", "Gerente"].includes(role.name);
          if (
            role.id === guild.id ||
            role.managed ||
            role.id === botMember.roles.highest.id ||
            administrative
          ) {
            continue;
          }
          try {
            await role.delete("Reset /setup_lanstec (cargos administrativos preservados)");
          } catch (error) {
            console.warn("Falha ao excluir cargo no reset", { error, id: role.id });
          }
        }
      }
    } else {
      // Reconciliação não destrutiva: nenhuma categoria/canal é apagado no modo padrão.
      // ensureCategory/ensureChannel abaixo preservam os IDs existentes e corrigem divergências.
    }

    const roles = new Map<string, Role>();
    for (const definition of roleDefinitions) {
      roles.set(definition.name, await ensureRole(guild, definition));
    }

    const botRole = roles.get("Bot / sistemas");
    if (botRole) {
      const botMember = await guild.members.fetchMe();
      if (!botMember.roles.cache.has(botRole.id)) {
        await botMember.roles.add(botRole);
      }
    }

    const everyone = guild.roles.everyone;
    let categoriesCreated = 0;
    let categoriesReused = 0;
    let channelsCreated = 0;
    let channelsSynced = 0;
    let announcementsFallback = 0;
    let stageFallback = 0;
    const categoryIds: Record<string, string> = {};
    const channelIds: Record<string, string> = {};

    for (const group of groups) {
      const overwrites: OverwriteResolvable[] = [];
      if (group.privacy !== "public") {
        overwrites.push({
          id: everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        });
        for (const roleName of [...roleChannelGroups[group.privacy], "Bot / sistemas"]) {
          const role = roles.get(roleName);
          if (!role) continue;
          overwrites.push({
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.SendMessagesInThreads,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          });
        }
      }

      const previousCategory = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory && channel.name === group.name,
      );
      const category = await ensureCategory(guild, group.name, overwrites);
      categoryIds[group.name] = category.id;
      if (previousCategory) categoriesReused++;
      else categoriesCreated++;

      for (const definition of group.channels) {
        const requestedType = definition.type ?? ChannelType.GuildText;
        const existed = guild.channels.cache.some(
          (channel) =>
            channel.parentId === category.id &&
            channel.name === definition.name &&
            (channel.type === requestedType ||
              (requestedType === ChannelType.GuildAnnouncement &&
                channel.type === ChannelType.GuildText)),
        );
        const channel = await ensureChannel(guild, category, definition);
        channelIds[definition.name] = channel.id;
        if (
          requestedType === ChannelType.GuildAnnouncement &&
          channel.type === ChannelType.GuildText
        ) announcementsFallback++;
        if (
          requestedType === ChannelType.GuildStageVoice &&
          channel.type === ChannelType.GuildVoice
        ) stageFallback++;
        if (existed) channelsSynced++;
        else channelsCreated++;
      }
    }

    await patchGuildRuntimeConfig(
      guild.id,
      {
        channels: channelIds,
        setup: {
          version: 2,
          mode: reset ? "reset" : resetChatsOnly ? "resetchatsonly" : "sync",
          categoryIds,
          channelIds,
          roleIds: Object.fromEntries([...roles].map(([name, role]) => [name, role.id])),
          syncedAt: new Date().toISOString(),
          syncedBy: interaction.user.id,
        },
      },
      interaction.user.id,
    );

    await publishOperationalLog(guild, "🏗️ Estrutura criada com sucesso", `**Categorias:** ${categoriesCreated} criadas / ${categoriesReused} mantidas\\n**Canais:** ${channelsCreated} criados / ${channelsSynced} mantidos\\n**Cargos:** ${roles.size} sincronizados`, "create");\n    await publishOperationalLog(guild, "🔄 Sincronizando painéis", "Publicando e verificando os painéis LANSTEC em seus canais de destino.", "update");\n    await publishGuildPanels(guild);
    const summary = [
      "✅ **LANSTEC — setup concluído**",
      `• ${categoriesCreated} categorias criadas / ${categoriesReused} reutilizadas; ${channelsCreated} canais criados / ${channelsSynced} sincronizados.`,
      `• ${roles.size} cargos; ${Object.keys(channelIds).length} IDs de canais persistidos no Supabase.`,
      "• Painéis verificados; mensagens inalteradas foram preservadas.",
      reset
        ? "⚠️ Reset executado; cargos administrativos preservados."
        : resetChatsOnly
          ? "🧩 Resetchatsonly: todos os canais/categorias recriados; todos os cargos preservados e sincronizados."
          : "🛡️ Sincronização segura: canais externos preservados; somente divergências LANSTEC corrigidas.",
      announcementsFallback || stageFallback
        ? "ℹ️ Community desativada: alguns tipos foram convertidos para Text/Voice."
        : "Tipos de canais aplicados conforme configuração.",
    ].join("\\n");
    await interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0x16a34a).addTextDisplayComponents(new TextDisplayBuilder().setContent(summary))], flags: MessageFlags.IsComponentsV2 });
  },
};
