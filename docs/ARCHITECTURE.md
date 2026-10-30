# Architecture

- Discord adapter: slash commands and interaction lifecycle in src/commands.
- Application services: conversation persistence and AI orchestration in src/services.
- Infrastructure clients: Gemini and Supabase in src/clients.
- Configuration: validated environment variables and structured logging in src/config.

## Request flow
1. User invokes /ask mensagem:<text>.
2. Bot acknowledges the interaction.
3. Supabase upserts the Discord user and loads/creates a conversation per user + channel.
4. Recent turns are sent to Gemini.
5. Prompt and answer are persisted.
6. Answer is split into Discord-safe message chunks.

## Security
- Secrets stay in server environment variables.
- Never commit .env or expose SUPABASE_SERVICE_ROLE_KEY.
- Service role bypasses RLS; use only in this trusted backend.
- RLS is enabled on every public table; no public policies are created.
- Add rate limits, abuse controls, retention rules and permission checks before broad production use.
