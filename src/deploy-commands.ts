import { registerSlashCommands } from "./services/command-registration.service.js";

await registerSlashCommands();
console.log("Discord slash commands synchronized.");
