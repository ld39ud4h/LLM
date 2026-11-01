import { REST, Routes } from "discord.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { commands } from "../commands/index.js";

export async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const body = commands.map((command) => command.data.toJSON());
  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  await rest.put(route, { body });

  logger.info(
    {
      feature: "discord-command-registration",
      commandCount: body.length,
      scope: env.DISCORD_GUILD_ID ? "guild" : "global",
      guildId: env.DISCORD_GUILD_ID ?? undefined,
      commandNames: body.map((command) => command.name),
    },
    "Slash commands synchronized with Discord",
  );
}
