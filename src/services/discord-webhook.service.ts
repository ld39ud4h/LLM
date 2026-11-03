import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

type WebhookField = { name: string; value: string; inline?: boolean };

const webhookUrl = env.DISCORD_LOG_WEBHOOK_URL;

function validWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

/** Sends operational events to the configured Discord webhook without blocking bot workflows. */
export async function sendDiscordWebhook(
  title: string,
  description: string,
  options: { color?: number; fields?: WebhookField[] } = {},
): Promise<void> {
  if (!webhookUrl) return;
  if (!validWebhookUrl(webhookUrl)) {
    logger.warn({ feature: "discord-webhook" }, "Webhook URL is invalid; expected a Discord webhook URL");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "LANSTEC | Monitoramento",
        embeds: [{
          title: title.slice(0, 256),
          description: description.slice(0, 4096),
          color: options.color ?? 0x16b8c9,
          fields: (options.fields ?? []).slice(0, 25).map((field) => ({
            name: field.name.slice(0, 256),
            value: field.value.slice(0, 1024),
            inline: field.inline ?? false,
          })),
          timestamp: new Date().toISOString(),
          footer: { text: "LANSTEC Tecnologia • eventos operacionais" },
        }],
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      logger.warn({ feature: "discord-webhook", status: response.status }, "Discord webhook returned a non-success status");
    }
  } catch (error) {
    logger.warn({ err: error, feature: "discord-webhook" }, "Could not send Discord webhook notification");
  }
}
