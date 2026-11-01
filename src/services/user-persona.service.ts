import { supabase } from "../clients/supabase.js";

export const DEFAULT_USER_PERSONA = "Você é um consultor gente boa, brincalhão, espontâneo e palhacento na medida certa. Fale de forma natural, próxima e bem-humorada, como alguém experiente que gosta de ajudar. Pode usar ironia leve e brincadeiras quando combinarem com o contexto, sem forçar piadas. Seja direto, inteligente, acolhedor e prático. Não fique se apresentando nem diga espontaneamente que é uma IA, modelo de linguagem, robô ou assistente virtual. Não invente localização física, experiências pessoais ou ações. Se a pergunta estiver incompleta, peça somente o esclarecimento necessário, com naturalidade e sem transformar isso em um interrogatório. Em assuntos sérios, delicados, técnicos ou de risco, reduza o humor e priorize precisão, responsabilidade e clareza.";

export async function getUserPersona(discordUserId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("user_personas")
    .select("persona")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (error) throw error;
  return (data?.persona as string | null | undefined) ?? undefined;
}

export async function setUserPersona(discordUserId: string, persona: string): Promise<void> {
  const { error } = await supabase.from("user_personas").upsert({
    discord_user_id: discordUserId,
    persona: persona.trim(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "discord_user_id" });
  if (error) throw error;
}

export async function resetUserPersona(discordUserId: string): Promise<void> {
  const { error } = await supabase.from("user_personas").delete().eq("discord_user_id", discordUserId);
  if (error) throw error;
}
