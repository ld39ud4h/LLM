import { remember } from "./memory.service.js";

export type NaturalAction = { kind: "memory_saved"; detail: string };

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function executeExplicitActions(prompt: string, userId: string): Promise<NaturalAction[]> {
  const text = normalize(prompt);
  const asksToSave = /\b(salve|salvar|guarde|guardar|memorize|memorizar|registre|registrar)\b/.test(text) &&
    /\b(memoria|lembranca|lembrar)\b/.test(text);
  if (!asksToSave) return [];
  // In a long message, retain the whole submitted material: it is the only reliable boundary
  // when the user refers to "this", "the previous and next item", or embeds the instruction.
  const material = prompt.trim().slice(0, 8000);
  if (!material) return [];
  await remember(userId, material);
  return [{ kind: "memory_saved", detail: "O conteúdo desta mensagem (até 8.000 caracteres) foi salvo na memória pessoal." }];
}
