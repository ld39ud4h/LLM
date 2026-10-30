import { REST,Routes } from "discord.js";
import { env } from "./config/env.js";
import { commands } from "./commands/index.js";
const rest=new REST({version:"10"}).setToken(env.DISCORD_TOKEN);
const body=commands.map(command=>command.data.toJSON());
if(env.DISCORD_GUILD_ID){await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,env.DISCORD_GUILD_ID),{body});console.log("Guild commands registered.");}
else{await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID),{body});console.log("Global commands registered; propagation may take time.");}
