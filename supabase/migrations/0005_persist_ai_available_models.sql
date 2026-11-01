alter table public.ai_runtime_state add column if not exists available_models jsonb not null default '[]'::jsonb;
