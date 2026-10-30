# Architecture

The bot supports slash commands and direct @mention replies in server channels.

## Request flow
1. A user invokes /ask or mentions the bot.
2. The bot loads or creates a conversation scoped to the Discord user and channel.
3. Recent turns, explicitly saved user memories, and optional server persona are loaded.
4. Gemini generates the response.
5. User and assistant turns are persisted in Supabase.

## Persistent memory
Memory is opt-in and user-controlled:
- /remember stores information explicitly submitted by the user.
- /memories lists saved facts privately.
- /forget deletes saved facts. Conversation history is not deleted by this command.
- Saved memories are context, not higher-priority instructions.

Conversation history persists independently of the bot process and is scoped per user + channel.

## Multifunctional persona
The default assistant supports general questions, learning, writing, programming and technology. Server administrators with Manage Server permission can customize the server-wide system prompt using /persona.

## Discord setup
Enable Message Content Intent in the Discord Developer Portal for mention replies. The application needs bot and applications.commands scopes, plus permission to view channels and send messages.

## Security
- Secrets stay in server environment variables.
- Never commit .env or expose SUPABASE_SERVICE_ROLE_KEY.
- Service role bypasses RLS; use only in this trusted backend.
- RLS is enabled on every public table; no public policies are created.
- Mention replies are limited to guild messages and explicit mentions.
- Add rate limits, abuse controls, retention rules and permission checks before broad production use.
