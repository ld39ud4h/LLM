create table if not exists public.user_memories(id uuid primary key default gen_random_uuid(),discord_user_id text not null references public.discord_users(discord_id) on delete cascade,content text not null check(char_length(content) between 1 and 500),created_at timestamptz not null default now());
create index if not exists user_memories_user_created_idx on public.user_memories(discord_user_id,created_at);
create table if not exists public.guild_settings(guild_id text primary key,system_prompt text not null check(char_length(system_prompt) between 1 and 1500),updated_at timestamptz not null default now());
alter table public.user_memories enable row level security;
alter table public.guild_settings enable row level security;
