# Database

Apply supabase/migrations/0001_initial_schema.sql to the Supabase project.

- discord_users: Discord account identifier and username.
- conversations: one conversation per Discord user and channel.
- messages: ordered user/model turns belonging to a conversation.

The bot uses the Supabase service role key only on the server. Row Level Security is enabled and public access is not granted. Never put the service role key in a browser, client app, or public repository.
