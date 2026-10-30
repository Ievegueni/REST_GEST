# RestoGest

Ver `CLAUDE.md` (arquitectura) e `SPRINTS.md` (plano).

## Dev

```sh
cp .env.example .env
docker compose up -d          # Postgres :5440, Redis :6390
pnpm install
pnpm --filter @restgest/api db:deploy          # aplica migrações
# alterar o schema: pnpm --filter @restgest/api db:new <nome> (recusa migrações vazias)
pnpm --filter @restgest/api db:seed   # tenant: admin@demo.local · /admin: admin@comunica.local (demo1234)
pnpm dev                      # API :3000, web :5173
pnpm dev:stop                 # termina todos os processos de dev (inclui filhos do tsx)
pnpm test && pnpm typecheck && pnpm lint
```

## Produção: criar Super Admin

```sh
SUPER_ADMIN_PASSWORD='...' pnpm --filter @restgest/api admin:create email@comunica.ao "Nome"
```
