create table if not exists public.user_personas (
  discord_user_id text primary key references public.discord_users(discord_id) on delete cascade,
  persona text not null check (char_length(persona) between 1 and 1500),
  updated_at timestamptz not null default now()
);

alter table public.user_personas enable row level security;
revoke all on table public.user_personas from anon, authenticated;
grant all on table public.user_personas to service_role;
