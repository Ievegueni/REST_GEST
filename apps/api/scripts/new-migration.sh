#!/bin/sh
# Cria e aplica uma migração a partir do schema (alternativa não interactiva a `prisma migrate dev`).
# Uso: pnpm --filter @restgest/api db:new <nome>
# Valida o schema primeiro e recusa migrações vazias (nunca as regista na BD).
set -e
name="$1"
[ -z "$name" ] && { echo "Uso: db:new <nome>"; exit 1; }
cd "$(dirname "$0")/.."
ENV="dotenv -e ../../.env --"
SHADOW="${SHADOW_DATABASE_URL:-postgresql://restgest:restgest@localhost:5440/restgest_shadow}"
pnpm exec $ENV prisma validate >/dev/null
dir="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_$name"
mkdir -p "$dir"
pnpm exec $ENV prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW" --script > "$dir/migration.sql"
if ! grep -qE '^(CREATE|ALTER|DROP)' "$dir/migration.sql" || [ "$(grep -cvE "SET DEFAULT current_setting|^--|^$" "$dir/migration.sql")" = "0" ]; then
  rm -r "$dir"
  echo "Sem alterações no schema: nenhuma migração criada."
  exit 0
fi
pnpm exec $ENV prisma migrate deploy
pnpm exec $ENV prisma generate >/dev/null
echo "Migração $dir aplicada."
