import pino from "pino";
import { env } from "./env.js";
export const logger=pino({level:env.LOG_LEVEL,redact:["*.token","*.apiKey","DISCORD_TOKEN","GEMINI_API_KEY","SUPABASE_SERVICE_ROLE_KEY"]});
