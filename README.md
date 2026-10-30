# LLM Discord Bot

Bot de Discord em TypeScript integrado ao Google Gemini e Supabase.

## Requisitos

- Node.js 22+
- pnpm 9+
- Aplicação criada no Discord Developer Portal
- Chave da API Gemini
- Projeto Supabase

## Desenvolvimento

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Configure as variáveis de ambiente em `.env`. Nunca publique tokens ou chaves privadas.

## Scripts

- `pnpm dev`: execução em desenvolvimento
- `pnpm build`: compilação TypeScript
- `pnpm start`: execução da versão compilada
- `pnpm typecheck`: verificação de tipos
- `pnpm test`: testes

## Estrutura

Veja `docs/ARCHITECTURE.md` e `docs/DATABASE.md`.
