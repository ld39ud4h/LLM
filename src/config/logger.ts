import pino from "pino";
import { env } from "./env.js";

const sensitiveFields = [
  "DISCORD_TOKEN",
  "GEMINI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "*.token",
  "*.apiKey",
  "*.authorization",
  "*.password",
  "*.secret",
  "*.service_role",
  "*.headers.authorization",
  "*.config.headers.authorization",
  "*.request.headers.authorization",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: sensitiveFields,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});
