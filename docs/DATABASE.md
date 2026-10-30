# Database

Apply migrations in order:
1. supabase/migrations/0001_initial_schema.sql
2. supabase/migrations/0002_persistent_memory_and_guild_settings.sql

Tables:
- discord_users: Discord account identifier and username.
- conversations: one conversation per Discord user and channel.
- messages: ordered user/model turns.
- user_memories: facts explicitly saved by a Discord user; deleted by /forget.
- guild_settings: server-level assistant persona configured by administrators.

The bot uses the Supabase service role key only on the server. RLS is enabled and public access is not granted.
