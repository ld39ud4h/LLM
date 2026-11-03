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
type ChannelKind = ChannelType.GuildText | ChannelType.GuildVoice;

const groups: Array<{
  name: string;
  privacy: "public" | GroupKey;
  channels: Array<{ name: string; type?: ChannelKind; topic?: string }>;
}> = [
  {
    name: "📌 LANSTEC | INÍCIO",
    privacy: "public",
    channels: [
      { name: "boas-vindas", topic: "Boas-vindas à LANSTEC Tecnologia." },
      { name: "regras-e-seguranca", topic: "Regras, privacidade e segurança da comunidade." },
      { name: "anuncios", topic: "Comunicados oficiais da LANSTEC." },
      { name: "documentacao-publica", topic: "Materiais e documentação pública." },
    ],
  },
  {
    name: "🏢 LANSTEC | EMPRESA",
    privacy: "staff",
    channels: [
      { name: "comunicacao-interna" },
      { name: "gestao-e-planejamento" },
      { name: "tarefas-e-projetos" },
      { name: "reunioes", type: ChannelType.GuildVoice },
    ],
  },
  {
    name: "🛡️ LANSTEC | CYBER LAB",
    privacy: "technical",
    channels: [
      { name: "laboratorio" },
      { name: "monitoramento" },
      { name: "alertas-de-seguranca", topic: "Alertas de segurança e eventos que exigem triagem." },
      { name: "documentacao-tecnica" },
    ],
  },
  {
    name: "🤝 LANSTEC | CLIENTES",
    privacy: "clients",
    channels: [
      { name: "central-de-atendimento", topic: "Orientações e encaminhamento de suporte." },
      { name: "abrir-ticket", topic: "Use o sistema de tickets quando estiver disponível." },
    ],
  },
  {
    name: "🌐 LANSTEC | COMUNIDADE",
    privacy: "public",
    channels: [
      { name: "bate-papo" },
      { name: "tecnologia-e-inovacao" },
      { name: "divulgacao" },
      { name: "sugestoes" },
    ],
  },
  {
    name: "🤖 LANSTEC | AUTOMAÇÃO",
    privacy: "admin",
    channels: [
      { name: "comandos-do-bot" },
      { name: "logs-do-bot", topic: "Logs operacionais, erros e diagnósticos do bot." },
      { name: "status-e-alertas", topic: "Inicialização, disponibilidade e status de execução." },
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

async function ensureChannel(
  guild: Guild,
  category: CategoryChannel,
  definition: { name: string; type?: ChannelKind; topic?: string },
): Promise<GuildBasedChannel> {
  const type = definition.type ?? ChannelType.GuildText;
  const existing = guild.channels.cache.find(
    (channel) => channel.parentId === category.id && channel.name === definition.name && channel.type === type,
  );
  if (existing) {
    if (type === ChannelType.GuildText && definition.topic && "setTopic" in existing) await existing.setTopic(definition.topic, "Sincronização de tópico LANSTEC");
    return existing;
  }
  return guild.channels.create({
    name: definition.name,
    type,
    parent: category.id,
    ...(type === ChannelType.GuildText && definition.topic ? { topic: definition.topic } : {}),
    reason: "Configuração inicial LANSTEC Tecnologia",
  });
}

export const setupLanstecCommand = {
  data: new SlashCommandBuilder()
    .setName("setup_lanstec")
    .setDescription("Cria a estrutura inicial da LANSTEC Tecnologia neste servidor.")
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
    let createdCategories = 0;
    let createdChannels = 0;
    let reusedCategories = 0;
    let reusedChannels = 0;

    for (const group of groups) {
      const overwrites: OverwriteResolvable[] = [];
      if (group.privacy !== "public") {
        overwrites.push({ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] });
        const allowedRoles = [...roleChannelGroups[group.privacy as GroupKey], "Bot / sistemas"];
        for (const roleName of allowedRoles) {
          const role = roles.get(roleName);
          if (role) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
        }
        for (const roleName of allowedRoles) {
          const role = roles.get(roleName);
          if (!role) continue;
          if (roleName === "Bot / sistemas") overwrites.push({ id: role.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
          else if (group.privacy === "staff" || group.privacy === "technical" || group.privacy === "clients") {
            overwrites.push({ id: role.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
          }
        }
      }

      const oldCategory = guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name === group.name,
      );
      const category = await ensureCategory(guild, group.name, overwrites);
      if (oldCategory) reusedCategories++; else createdCategories++;

      for (const channelDefinition of group.channels) {
        const existed = guild.channels.cache.some(
          (channel) => channel.parentId === category.id && channel.name === channelDefinition.name && channel.type === (channelDefinition.type ?? ChannelType.GuildText),
        );
        await ensureChannel(guild, category, channelDefinition);
        if (existed) reusedChannels++; else createdChannels++;
      }
    }

    await publishGuildPanels(guild);
    await interaction.editReply([
      "✅ **LANSTEC Tecnologia configurada!**",
      `• ${createdCategories} categorias criadas (${reusedCategories} existentes sincronizadas).`,
      `• ${createdChannels} canais criados (${reusedChannels} existentes mantidos).`,
      `• ${roleDefinitions.length} cargos verificados/criados.`,
      "",
      "A configuração é idempotente: executar novamente não duplica categorias ou canais.",
      "⚠️ Atribua os cargos aos membros e revise os acessos antes de compartilhar dados confidenciais.",
      "• Painéis de sugestões e atendimento publicados/sincronizados.",
      "• Cartão de boas-vindas ativado para novos membros.",
      "Os tickets individuais com canais privados serão adicionados em uma próxima etapa.",
    ].join("\n"));
  },
};
