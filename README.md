# LLM — Discord Gemini Bot

Discord AI assistant built with TypeScript, discord.js, Google Gemini and Supabase.

## Features
- Slash command /ask and direct @mention replies.
- Persistent conversation history per user and channel.
- User-controlled persistent memory: /remember, /memories and /forget.
- Server-specific assistant persona configurable by administrators with /persona.
- Validated environment variables and structured logs.

## Requirements
- Node.js 22+
- pnpm 9+
- Discord application/bot token
- Gemini API key
- Supabase project

## Setup
~~~bash
pnpm install
cp .env.example .env
~~~
Fill in .env, then apply the SQL migrations in supabase/migrations in order.

Register slash commands:
~~~bash
pnpm deploy:commands
~~~
Start locally:
~~~bash
pnpm dev
~~~

Enable Message Content Intent in the Discord Developer Portal to receive mention text. Keep all secrets out of Git.
