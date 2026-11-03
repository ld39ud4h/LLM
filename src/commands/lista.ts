import { SlashCommandBuilder, ChatInputCommandInteraction, ContainerBuilder, TextDisplayBuilder, MessageFlags } from "discord.js";

const commandDocs = [
  ["/ask", "Converse com o consultor de IA."],
  ["/persona", "Personalize o estilo do consultor."],
  ["/lembrar", "Salve uma informação na memória (se disponível)."],
  ["/memorias", "Consulte suas memórias salvas."],
  ["/esquecer", "Remova uma memória específica."],
  ["/lista", "Exibe este catálogo de comandos."],
  ["/setup_lanstec", "Configura categorias, canais, cargos e painéis (administradores)."],
  ["/webhook_test", "Testa o webhook de monitoramento (administradores)."],
  ["/alerta-seguranca", "Registra alerta no canal de segurança (equipe)."],
];

export const listaCommand = {
  data: new SlashCommandBuilder().setName("lista").setDescription("Lista de comandos e documentação rápida"),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const content = "# 📖 Catálogo de comandos LANSTEC\n" +
      commandDocs.map(([name, description]) => `**${name}** — ${description}`).join("\n") +
      "\n\n**Painéis:** sugestões, atendimento, tickets, regras e documentação pública.\n" +
      "Use os comandos conforme suas permissões. Recursos administrativos são restritos.";
    const card = new ContainerBuilder().setAccentColor(0x06b6d4)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# LANSTEC Tecnologia • documentação rápida"));
    await interaction.reply({ components: [card], flags: [MessageFlags.IsComponentsV2], ephemeral: true });
  },
};
