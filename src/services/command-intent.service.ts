import { commands } from "../commands/index.js";

const docs: Record<string, string> = {
  ask: "Conversa com o consultor de IA. Exemplo: /ask pergunta: ...",
  persona: "Abre a personalização do consultor. Use /persona para escolher o estilo.",
  remember: "Salva algo na memória. Exemplo: /remember conteúdo: prefiro respostas curtas.",
  memories: "Mostra suas memórias salvas. Use /memories.",
  forget: "Apaga uma memória selecionada. Use /forget e escolha o item.",
  lista: "Exibe a lista de comandos. Você também pode pedir 'liste os comandos' aqui no chat.",
  setup_lanstec: "Configura a estrutura LANSTEC (categorias, canais, cargos e painéis); requer permissão administrativa.",
  webhook_test: "Testa o webhook de monitoramento; restrito a administradores.",
  "alerta-seguranca": "Registra um alerta no canal de segurança; exige permissão da equipe.",
};

const aliases: Record<string, string> = {
  "listar comandos": "lista", "liste comandos": "lista", "lista de comandos": "lista",
  "mostrar comandos": "lista", "quais comandos": "lista", "todos os comandos": "lista",
  "comandos do bot": "lista", "ajuda": "lista", "help": "lista",
  "abrir ticket": "ticket", "criar ticket": "ticket", "suporte": "support",
  "abrir atendimento": "support", "enviar sugestão": "suggestion", "fazer sugestão": "suggestion",
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[!?.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function routeCommandIntent(prompt: string): string | null {
  const text = normalize(prompt);
  const wantsList = /\b(liste|listar|mostre|mostrar|exiba|exibir|quais|todos|todas)\b/.test(text) &&
    /\b(comandos?|slash commands?|comandos do bot)\b/.test(text);
  const exactAlias = aliases[text];
  if (!wantsList && !exactAlias && !/^(executa|execute|roda|rode|usa|use|aciona|acionar)\b/.test(text)) return null;

  if (wantsList || exactAlias === "lista") {
    const rows = commands.map((command) => {
      const name = command.data.name;
      return `• **/${name}** — ${docs[name] ?? command.data.description}`;
    });
    return ["## 🧭 Comandos do bot", ...rows,
      "", "**Também há painéis:** tickets, atendimento/suporte, sugestões, regras e documentação.",
      "Pode pedir em linguagem natural, por exemplo: *'quero abrir um ticket'* ou *'me ajuda a salvar uma memória'*."].join("\n");
  }

  if (exactAlias === "ticket") return "Para abrir um ticket, clique em **Abrir ticket** no painel de Tickets do servidor. Se você me disser o assunto, posso orientar o preenchimento.";
  if (exactAlias === "support") return "Para abrir atendimento, clique em **Solicitar atendimento** no painel de Suporte e preencha o formulário.";
  if (exactAlias === "suggestion") return "Para enviar uma sugestão, clique em **Enviar sugestão** no painel de Sugestões e preencha o formulário.";

  const slash = text.match(/\/?([a-z][a-z0-9_-]*)\b/);
  const commandName = slash?.[1]?.replace(/^\//, "");
  const command = commands.find((item) => item.data.name === commandName);
  if (!command) return "Não identifiquei qual comando você quer. Diga o nome ou peça **'liste os comandos'**.";
  return `Entendi: **/${commandName}** — ${docs[commandName] ?? command.data.description}.\n\nPara segurança e compatibilidade com o Discord, comandos Slash são executados como interações nativas. Eu consigo orientar e abrir os fluxos por linguagem natural quando há uma ação interna disponível; para este comando, use **/${commandName}** no Discord.`;
}
