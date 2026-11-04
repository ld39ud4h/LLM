import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, SeparatorBuilder,
} from "discord.js";
import type { Task, Project } from "./workspace.service.js";

const v2 = (container: ContainerBuilder) => ({
  components: [container],
  flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
});
const button = (id: string, label: string, style = ButtonStyle.Secondary, emoji?: string) => {
  const item = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) item.setEmoji(emoji);
  return item;
};

export function workHome() {
  const container = new ContainerBuilder().setAccentColor(0x0891b2)
    .addTextDisplayComponents(t => t.setContent("# 🗂️ Meu espaço de trabalho\nEscolha uma área. Seus dados são privados e visíveis somente para você."))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("lanstec:work:tasks", "Tarefas", ButtonStyle.Primary, "📋"),
      button("lanstec:work:projects", "Projetos", ButtonStyle.Success, "🗃️"),
    ));
  return v2(container);
}

export function taskList(tasks: Task[]) {
  const container = new ContainerBuilder().setAccentColor(0x2563eb)
    .addTextDisplayComponents(t => t.setContent("# 📋 Minhas tarefas\n" + (tasks.length
      ? tasks.slice(0, 20).map(x => `• **${x.title}** — ${x.status === "todo" ? "A fazer" : x.status === "doing" ? "Em andamento" : "Concluída"} · ${x.priority === "high" ? "🔴 Alta" : x.priority === "low" ? "🟢 Baixa" : "🟡 Normal"}`).join("\n")
      : "Você ainda não possui tarefas.")))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("lanstec:work:task:create", "Nova tarefa", ButtonStyle.Success, "➕"),
      button("lanstec:work:home", "Voltar"),
    ));
  if (tasks.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("lanstec:work:task:select").setPlaceholder("Selecione uma tarefa para gerenciar")
      .addOptions(tasks.slice(0, 25).map(x => new StringSelectMenuOptionBuilder().setLabel(x.title.slice(0, 100)).setValue(x.id).setDescription(x.status))),
  ));
  return v2(container);
}

export function projectList(projects: Project[]) {
  const container = new ContainerBuilder().setAccentColor(0x0f766e)
    .addTextDisplayComponents(t => t.setContent("# 🗃️ Meus projetos\n" + (projects.length
      ? projects.slice(0, 20).map(x => `• **${x.name}** — ${x.status === "active" ? "Ativo" : x.status === "paused" ? "Pausado" : "Concluído"}`).join("\n")
      : "Você ainda não possui projetos.")))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(2))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("lanstec:work:project:create", "Novo projeto", ButtonStyle.Success, "➕"),
      button("lanstec:work:home", "Voltar"),
    ));
  if (projects.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("lanstec:work:project:select").setPlaceholder("Selecione um projeto para gerenciar")
      .addOptions(projects.slice(0, 25).map(x => new StringSelectMenuOptionBuilder().setLabel(x.name.slice(0, 100)).setValue(x.id).setDescription(x.status))),
  ));
  return v2(container);
}

export function taskDetail(t: Task) {
  return v2(new ContainerBuilder().setAccentColor(0x2563eb)
    .addTextDisplayComponents(x => x.setContent(`# 📋 ${t.title}\n${t.description || "Sem descrição"}\n\n**Status:** ${t.status}\n**Prioridade:** ${t.priority}\n**Prazo:** ${t.due_date || "Não definido"}`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("lanstec:work:task:edit:" + t.id, "Editar", ButtonStyle.Primary, "✏️"),
      button("lanstec:work:task:status:" + t.id, "Avançar status", ButtonStyle.Success, "🔄"),
      button("lanstec:work:task:delete:" + t.id, "Excluir", ButtonStyle.Danger, "🗑️"),
    )));
}

export function projectDetail(p: Project) {
  return v2(new ContainerBuilder().setAccentColor(0x0f766e)
    .addTextDisplayComponents(x => x.setContent(`# 🗃️ ${p.name}\n${p.description || "Sem descrição"}\n\n**Status:** ${p.status}`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("lanstec:work:project:edit:" + p.id, "Editar", ButtonStyle.Primary, "✏️"),
      button("lanstec:work:project:status:" + p.id, "Alternar status", ButtonStyle.Success, "🔄"),
      button("lanstec:work:project:delete:" + p.id, "Excluir", ButtonStyle.Danger, "🗑️"),
    )));
}

export function taskModal(mode: "create" | "edit", task?: Task) {
  return new ModalBuilder().setCustomId("lanstec:work:task:submit:" + mode + (task ? ":" + task.id : "")).setTitle(mode === "create" ? "Nova tarefa" : "Editar tarefa")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("title").setLabel("Título").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(task?.title ?? "")),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(false).setValue(task?.description ?? "")),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("due").setLabel("Prazo (AAAA-MM-DD, opcional)").setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(false).setValue(task?.due_date ?? "")),
    );
}

export function projectModal(mode: "create" | "edit", project?: Project) {
  return new ModalBuilder().setCustomId("lanstec:work:project:submit:" + mode + (project ? ":" + project.id : "")).setTitle(mode === "create" ? "Novo projeto" : "Editar projeto")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Nome").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(project?.name ?? "")),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("description").setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(false).setValue(project?.description ?? "")),
    );
}
