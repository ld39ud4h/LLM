import { Client,Events,GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";import { logger } from "./config/logger.js";import { commands } from "./commands/index.js";
const client=new Client({intents:[GatewayIntentBits.Guilds]});const commandMap=new Map(commands.map(command=>[command.data.name,command]));
client.once(Events.ClientReady,readyClient=>logger.info({tag:readyClient.user.tag},"Discord bot is online"));
client.on(Events.InteractionCreate,async interaction=>{if(!interaction.isChatInputCommand())return;const command=commandMap.get(interaction.commandName);if(command)await command.execute(interaction);});
client.on(Events.Error,error=>logger.error({error},"Discord client error"));
process.on("unhandledRejection",reason=>logger.error({reason},"Unhandled rejection"));
process.on("SIGINT",()=>{client.destroy();process.exit(0);});process.on("SIGTERM",()=>{client.destroy();process.exit(0);});
await client.login(env.DISCORD_TOKEN);
