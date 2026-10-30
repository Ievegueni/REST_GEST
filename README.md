# RestoGest

Ver `CLAUDE.md` (arquitectura) e `SPRINTS.md` (plano).

## Dev

```sh
cp .env.example .env
docker compose up -d          # Postgres :5440, Redis :6390
pnpm install
pnpm --filter @restgest/api db:migrate
pnpm --filter @restgest/api db:seed   # admin@demo.local / demo1234
pnpm dev                      # API :3000, web :5173
pnpm test && pnpm typecheck && pnpm lint
```
