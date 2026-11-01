import { randomUUID } from "node:crypto";
import { remember } from "./memory.service.js";

const pending = new Map<string, { userId: string; answer: string; createdAt: number }>();
const TTL_MS = 30 * 60 * 1000;

export function registerAnswerForRemember(userId: string, answer: string): string {
  const now = Date.now();
  for (const [key, value] of pending) if (now - value.createdAt > TTL_MS) pending.delete(key);
  const token = randomUUID().replace(/-/g, "").slice(0, 20);
  pending.set(token, { userId, answer, createdAt: now });
  return token;
}

export async function rememberGeneratedAnswer(userId: string, token: string): Promise<void> {
  const entry = pending.get(token);
  if (!entry || entry.userId !== userId || Date.now() - entry.createdAt > TTL_MS) throw new Error("Resposta indisponível para salvar");
  await remember(userId, entry.answer);
  pending.delete(token);
}
