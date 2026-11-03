# LANSTEC Bot Internal API

Base: `https://<render-service>/api/v1`. All endpoints require `Authorization: Bearer <BOT_API_SECRET>`; never expose this secret to browser/client-side code. Responses are JSON.

- `GET /tickets?guildId=<discord-guild-id>&status=open|claimed|closed` — list (max 100).
- `POST /tickets/claim` — `{"channelId":"...","actorId":"..."}`.
- `POST /tickets/close` — `{"channelId":"...","actorId":"..."}`.
- `POST /suggestions/vote` — `{"suggestionId":"uuid","userId":"...","vote":1|-1}`.
- `POST /audit` — `{"guildId":"...","actorId":"...","eventType":"...","targetId":"...","metadata":{}}`.

The bot itself writes directly through the Supabase service-role client; this API is a controlled integration bridge for trusted automation/admin clients. Data tables are RLS-enabled and revoked from anon/authenticated roles; only service_role has access. Never put the service-role key or BOT_API_SECRET in Discord messages, logs, or public clients.
