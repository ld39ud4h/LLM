import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  Guild,
  Role,
  CategoryChannel,
  GuildBasedChannel,
  OverwriteResolvable,
} from "discord.js";
import { publishGuildPanels } from "../services/guild-panels.service.js";

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
  if (existing) return existing;
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
  const type = definition.type ?? ChannelType.GuildText;
  const existing = guild.channels.cache.find(
    (channel) => channel.parentId === category.id && channel.name === definition.name && channel.type === type,
  );
  if (existing) {
    if ("setTopic" in existing && definition.topic) await existing.setTopic(definition.topic);
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
    .setDescription("Cria/sincroniza a estrutura profissional da LANSTEC Tecnologia.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Este comando só funciona dentro de um servidor.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const roles = new Map<string, Role>();
    for (const definition of roleDefinitions) roles.set(definition.name, await ensureRole(guild, definition));
    const botRole = roles.get("Bot / sistemas");
    if (botRole) {
      const botMember = await guild.members.fetchMe();
      if (!botMember.roles.cache.has(botRole.id)) await botMember.roles.add(botRole, "Acesso do bot aos canais internos LANSTEC");
    }

    const everyone = guild.roles.everyone;
    let createdCategories = 0, createdChannels = 0, reusedCategories = 0, reusedChannels = 0;
    for (const group of groups) {
      const overwrites: OverwriteResolvable[] = [];
      if (group.privacy !== "public") {
        overwrites.push({ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] });
        const allowedRoles = [...roleChannelGroups[group.privacy], "Bot / sistemas"];
        for (const roleName of allowedRoles) {
          const role = roles.get(roleName);
          if (!role) continue;
          const isBot = roleName === "Bot / sistemas";
          overwrites.push({
            id: role.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              ...(isBot ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] : [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.CreatePublicThreads,
                PermissionFlagsBits.CreatePrivateThreads,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
              ]),
            ],
          });
        }
      }

      const oldCategory = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === group.name);
      const category = await ensureCategory(guild, group.name, overwrites);
      if (oldCategory) reusedCategories++; else createdCategories++;
      for (const def of group.channels) {
        const existed = guild.channels.cache.some((c) => c.parentId === category.id && c.name === def.name && c.type === (def.type ?? ChannelType.GuildText));
        await ensureChannel(guild, category, def);
        if (existed) reusedChannels++; else createdChannels++;
      }
    }

    await publishGuildPanels(guild);
    await interaction.editReply([
      "✅ **LANSTEC Tecnologia — estrutura sincronizada!**",
      `• ${createdCategories} categorias criadas; ${reusedCategories} sincronizadas.`,
      `• ${createdChannels} canais criados; ${reusedChannels} já existentes.`,
      `• ${roleDefinitions.length} cargos verificados/criados.`,
      "",
      "Tipos aplicados: anúncios (Announcement), sugestões/ideias/problemas (Forum), conversa (Text), salas (Voice) e palco (Stage).",
      "⚠️ Revise os cargos e permissões antes de publicar dados internos. O comando não apaga canais antigos nem migra mensagens.",
      "Painéis de atendimento/sugestões e boas-vindas foram sincronizados.",
    ].join("\n"));
  },
};
