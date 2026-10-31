# Deploy (VPS Ubuntu, PM2 + Nginx)

Requisitos: Node 20+, pnpm, PostgreSQL 16, Redis 7, Nginx, certbot, PM2 (`npm i -g pm2`), rclone (backups).

## 1. Primeira instalação
```sh
sudo mkdir -p /srv/restgest && sudo chown $USER /srv/restgest
git clone <repo> /srv/restgest && cd /srv/restgest
cp .env.example .env    # preencher (ver abaixo)
pnpm install --frozen-lockfile
pnpm --filter @restgest/api db:deploy
pnpm build
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
sudo cp deploy/nginx.conf /etc/nginx/sites-available/restgest
sudo ln -s /etc/nginx/sites-available/restgest /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <domínio>
pm2 install pm2-logrotate     # logs com rotação (evita encher o disco)
```
Criar o Super Admin com `pnpm --filter @restgest/api db:seed` **só** numa base vazia e mudar a senha logo a seguir (o seed cria também o tenant de demonstração — apagá-lo/suspendê-lo em `/admin`). O tenant Palace é criado no `/admin`, nunca por seed.

## 2. `.env` de produção
| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` (definido no ecosystem) |
| `DATABASE_URL`, `REDIS_URL` | serviços locais |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — **guardar fora da VPS**; sem ela os IBAN não se recuperam |
| `APP_URL` | `https://<domínio>` (CORS) |
| `CLOUDINARY_URL` | obrigatório em produção (sem ele os anexos ficam no disco da VPS) |
| `FUTURIX_SMS_*` | opcional: a chave pode ser configurada no `/admin` → Integrações (guardada cifrada; tem prioridade sobre o `.env`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Analisador IA (modelo por defeito `claude-opus-5`) |
| `HOST`, `TRUST_PROXY`, `RUN_WORKERS` | definidos no ecosystem (`127.0.0.1`, `true`, `false`) |

## 3. Actualizações
```sh
cd /srv/restgest && git pull
pnpm install --frozen-lockfile
pnpm --filter @restgest/api db:deploy
pnpm build
pm2 reload ecosystem.config.cjs --update-env   # a partir de deploy/
```

## 4. Backups
`crontab -e` → `0 2 * * * BACKUP_REMOTE=b2:restgest-backups /srv/restgest/deploy/backup.sh`
Restaurar: `pg_restore --clean --no-owner -d "$DATABASE_URL" restgest-AAAAMMDD-HHMM.dump`. Testar o restauro numa base à parte uma vez por mês.

## 5. Verificação
- `curl https://<domínio>/api/health` → `{"data":{"status":"ok"}}`
- `pm2 status`: `restgest-api` e `restgest-worker` online; `pm2 logs restgest-worker` mostra "workers iniciados".
- Firewall: só 22/80/443 abertos (`ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw enable`). PostgreSQL e Redis só em localhost.
