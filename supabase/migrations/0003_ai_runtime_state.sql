create table if not exists public.ai_runtime_state (
  state_key text primary key,
  active_provider text not null check (active_provider in ('gemini', 'openrouter')),
  active_model text not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_runtime_state enable row level security;
revoke all on table public.ai_runtime_state from anon, authenticated;
grant all on table public.ai_runtime_state to service_role;
