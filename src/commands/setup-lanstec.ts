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
  if (existing) {
    await existing.edit({ color: definition.color, permissions: definition.permissions ?? [] }, "Sincronização de cargo LANSTEC");
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
 data:new SlashCommandBuilder().setName("setup_lanstec").setDescription("Cria/sincroniza ou recria a estrutura LANSTEC.")
 .addStringOption(o=>o.setName("modo").setDescription("Vazio = seletivo; reset = recriar estrutura; resetchatsonly = preservar cargos").addChoices({name:"Reset integral (preserva cargos administrativos)",value:"reset"},{name:"Reset somente canais (preserva todos os cargos)",value:"resetchatsonly"}))
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
 async execute(interaction:ChatInputCommandInteraction){
 const guild=interaction.guild;if(!guild){await interaction.reply({content:"Somente em servidor.",ephemeral:true});return;}
 const mode=interaction.options.getString("modo")??"selective";const reset=mode==="reset";const resetChatsOnly=mode==="resetchatsonly";await interaction.deferReply({ephemeral:true});
 if(reset||resetChatsOnly){
  const panel=new ContainerBuilder().setAccentColor(0xdc2626)
   .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ⚠️ Reset integral\n**Todos os canais e categorias serão excluídos**, inclusive os que não são LANSTEC. Cargos administrativos (Administrador/Gerente e cargos com permissão Administrator), membros e @everyone serão preservados. Outros cargos personalizados poderão ser removidos. Cargos gerenciados por integrações não podem ser removidos."))
   .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
   .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("setup-lanstec-reset-confirm").setLabel("Apagar canais e recriar").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("setup-lanstec-reset-cancel").setLabel("Cancelar").setStyle(ButtonStyle.Secondary)));
  const msg=await interaction.followUp({components:[panel],flags:MessageFlags.Ephemeral|MessageFlags.IsComponentsV2});
  try{const c=await msg.awaitMessageComponent({time:60000,filter:i=>i.user.id===interaction.user.id&&i.customId.startsWith("setup-lanstec-reset-")});if(c.customId.endsWith("cancel")){await c.update({content:"Reset cancelado.",components:[]});await interaction.editReply("Reset cancelado.");return;}await c.deferUpdate();}
  catch{await interaction.editReply({content:"Confirmação expirada; nada foi apagado.",components:[]});return;}
  await interaction.editReply({content:"🧹 Apagando estrutura…",components:[]});
  for(const ch of [...guild.channels.cache.values()])try{await ch.delete(resetChatsOnly?"Reset somente canais /setup_lanstec":"Reset /setup_lanstec");}catch(e){logger.warn({err:e,id:ch.id},"Falha ao excluir canal no reset");}
  if(reset){const me=await guild.members.fetchMe();for(const role of [...guild.roles.cache.values()].sort((a,b)=>b.position-a.position)){const administrative=role.permissions.has(PermissionFlagsBits.Administrator)||["Administrador","Gerente"].includes(role.name);if(role.id===guild.id||role.managed||role.id===me.roles.highest.id||administrative)continue;try{await role.delete("Reset /setup_lanstec (cargos administrativos preservados)");}catch(e){logger.warn({err:e,id:role.id},"Falha ao excluir cargo no reset");}}
 }else{
  // B: remove only the known LANSTEC categories (and their contents); leaves unrelated server channels untouched.
  const names=new Set(groups.map(g=>g.name));for(const cat of guild.channels.cache.filter(c=>c.type===ChannelType.GuildCategory&&names.has(c.name)).values()){for(const child of guild.channels.cache.filter(c=>c.parentId===cat.id).values())try{await child.delete("Reconstrução seletiva LANSTEC");}catch{}try{await cat.delete("Reconstrução seletiva LANSTEC");}catch{}}
 }
 const roles=new Map<string,Role>();for(const d of roleDefinitions)roles.set(d.name,await ensureRole(guild,d));
 const botRole=roles.get("Bot / sistemas");if(botRole){const me=await guild.members.fetchMe();if(!me.roles.cache.has(botRole.id))await me.roles.add(botRole);}
 const everyone=guild.roles.everyone;let cc=0,rc=0,cn=0,rn=0,af=0,sf=0;const categoryIds:Record<string,string>={},channelIds:Record<string,string>={};
 for(const group of groups){const ow:OverwriteResolvable[]=[];if(group.privacy!=="public"){ow.push({id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]});for(const rn of [...roleChannelGroups[group.privacy],"Bot / sistemas"]){const r=roles.get(rn);if(!r)continue;ow.push({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages,PermissionFlagsBits.SendMessagesInThreads,PermissionFlagsBits.CreatePublicThreads,PermissionFlagsBits.CreatePrivateThreads,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]});}}
 const old=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===group.name),cat=await ensureCategory(guild,group.name,ow);categoryIds[group.name]=cat.id;if(old)rc++;else cc++;
 for(const d of group.channels){const type=d.type??ChannelType.GuildText,ex=guild.channels.cache.some(c=>c.parentId===cat.id&&c.name===d.name&&(c.type===type||(type===ChannelType.GuildAnnouncement&&c.type===ChannelType.GuildText))),ch=await ensureChannel(guild,cat,d);channelIds[d.name]=ch.id;if(type===ChannelType.GuildAnnouncement&&ch.type===ChannelType.GuildText)af++;if(type===ChannelType.GuildStageVoice&&ch.type===ChannelType.GuildVoice)sf++;if(ex)rn++;else cn++;}}
 await patchGuildRuntimeConfig(guild.id,{channels:channelIds,panels:{},webhooks:{},setup:{version:2,mode:reset?"reset":resetChatsOnly?"resetchatsonly":"selective",categoryIds,channelIds,roleIds:Object.fromEntries([...roles].map(([n,r])=>[n,r.id])),syncedAt:new Date().toISOString(),syncedBy:interaction.user.id}},interaction.user.id);
 await publishGuildPanels(guild);
 await interaction.editReply(["✅ **LANSTEC — setup concluído**",`• ${cc} categorias criadas / ${rc} reutilizadas; ${cn} canais criados / ${rn} sincronizados.`,`• ${roles.size} cargos; ${Object.keys(channelIds).length} IDs de canais persistidos no Supabase.`,"• Painéis republicados; cache de referências antigas de painéis/webhooks zerado.",reset?"⚠️ Reset executado; cargos administrativos preservados.":resetChatsOnly?"🧩 Resetchatsonly: todos os canais/categorias recriados; todos os cargos preservados e sincronizados.":"🛡️ Modo seletivo: canais/categorias externos preservados; categorias LANSTEC reconstruídas.",af||sf?"ℹ️ Community desativada: alguns tipos foram convertidos para Text/Voice.":"Tipos de canais aplicados conforme configuração."].join("\n"));
 }
};