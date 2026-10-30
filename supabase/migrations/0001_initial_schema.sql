create extension if not exists pgcrypto;
create table if not exists public.discord_users(discord_id text primary key,username text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.conversations(id uuid primary key default gen_random_uuid(),discord_user_id text not null references public.discord_users(discord_id) on delete cascade,channel_id text not null,created_at timestamptz not null default now(),unique(discord_user_id,channel_id));
create table if not exists public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,role text not null check(role in ('user','model')),content text not null,created_at timestamptz not null default now());
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
-- The bot backend uses the service role key. Do not grant public API access.
alter table public.discord_users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
