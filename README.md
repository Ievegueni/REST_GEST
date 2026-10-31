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

## Dados de demonstração
`pnpm --filter @restgest/api db:mock` (depois do `db:seed`) cria no "Restaurante Demo" 100 artigos, 7 fornecedores, 53 fichas técnicas e 60 dias de movimentos nas duas unidades (recepções, vendas importadas do POS, quebras, consumos, transferências e inventário), sempre pelos serviços da aplicação. Retomável: se for interrompido, volta a correr do ponto onde parou.

## Deploy
Ver [`deploy/DEPLOY.md`](deploy/DEPLOY.md) (PM2 com API + worker, Nginx, SSL, backups). Bateria de testes manuais: [`TESTES.md`](TESTES.md).
