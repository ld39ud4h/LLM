-- Daily AI model catalog refresh via Supabase Cron -> pg_net -> protected Render endpoint.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Secrets are populated separately in Vault; no credentials are stored in this migration.
select cron.schedule(
  'daily-ai-provider-bootstrap',
  '17 6 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ai_bootstrap_render_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ai_bootstrap_cron_secret')
      ),
      body := jsonb_build_object('trigger', 'supabase-cron', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $job$
);
