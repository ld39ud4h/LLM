import { supabase } from "../clients/supabase.js";

export const PERSONA_PRESETS = {
  playful: {
    label: "Consultor brincalhão",
    description: "Descontraído, espirituoso e palhacento na medida certa.",
    prompt: "Você é um consultor gente boa, brincalhão, espontâneo e palhacento na medida certa. Fale de forma natural, próxima e bem-humorada. Use ironia leve quando combinar, sem forçar piadas. Seja direto, inteligente, acolhedor e prático. Em assuntos sérios, reduza o humor e priorize precisão.",
  },
  professional: {
    label: "Profissional elegante",
    description: "Educado, confiante, organizado e profissional.",
    prompt: "Adote uma postura profissional, elegante e cordial. Seja claro, confiante, organizado e diplomático. Evite gírias e excesso de informalidade, sem soar frio ou burocrático.",
  },
  teacher: {
    label: "Professor didático",
    description: "Explica passo a passo, com exemplos simples.",
    prompt: "Aja como um professor paciente e didático. Explique conceitos em etapas, use exemplos concretos e analogias úteis. Verifique pressupostos e não pule etapas importantes. Evite infantilizar o usuário.",
  },
  concise: {
    label: "Direto ao ponto",
    description: "Respostas curtas, práticas e sem rodeios.",
    prompt: "Seja extremamente claro, objetivo e econômico. Comece pela resposta principal, elimine introduções desnecessárias e use listas apenas quando facilitarem a compreensão. Inclua ressalvas essenciais, sem alongar.",
  },
  technical: {
    label: "Especialista técnico",
    description: "Detalhista, preciso e orientado a soluções.",
    prompt: "Adote a postura de um especialista técnico. Use terminologia correta, explique decisões, considere alternativas e destaque riscos, limitações e boas práticas. Seja preciso e estruturado, sem presumir conhecimento que o usuário não demonstrou.",
  },
  friendly: {
    label: "Amigável e acolhedor",
    description: "Leve, paciente e próximo, sem exagerar nas piadas.",
    prompt: "Converse de forma amigável, acolhedora, paciente e natural. Demonstre atenção ao que a pessoa quis dizer, sem exagerar na intimidade, nos emojis ou nas brincadeiras. Seja encorajador e prático.",
  },
} as const;

export type PersonaKey = keyof typeof PERSONA_PRESETS;
export const DEFAULT_PERSONA_KEY: PersonaKey = "playful";
export const DEFAULT_USER_PERSONA = PERSONA_PRESETS[DEFAULT_PERSONA_KEY].prompt;

function isPersonaKey(value: string): value is PersonaKey {
  return Object.prototype.hasOwnProperty.call(PERSONA_PRESETS, value);
}

export async function getUserPersonaKey(discordUserId: string): Promise<PersonaKey | undefined> {
  const { data, error } = await supabase
    .from("user_personas")
    .select("persona")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (error) throw error;
  const value = data?.persona as string | null | undefined;
  return value && isPersonaKey(value) ? value : undefined;
}

export async function getUserPersona(discordUserId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("user_personas")
    .select("persona")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (error) throw error;
  const value = data?.persona as string | null | undefined;
  if (!value) return undefined;
  if (isPersonaKey(value)) return PERSONA_PRESETS[value].prompt;
  // Compatibilidade com personalizações antigas já salvas.
  return value;
}

export async function setUserPersona(discordUserId: string, persona: PersonaKey): Promise<void> {
  if (!isPersonaKey(persona)) throw new Error("Invalid persona preset");
  const { error } = await supabase.from("user_personas").upsert({
    discord_user_id: discordUserId,
    persona,
    updated_at: new Date().toISOString(),
  }, { onConflict: "discord_user_id" });
  if (error) throw error;
}

export async function resetUserPersona(discordUserId: string): Promise<void> {
  const { error } = await supabase.from("user_personas").delete().eq("discord_user_id", discordUserId);
  if (error) throw error;
}
