#!/usr/bin/env bash
# Copia la base de Neon completa al contenedor `postgres` de docker-compose.
#
# Uso (desde la raíz del repo, con .env ya configurado):
#   NEON_URL='postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require' \
#     ./scripts/db/migrate-from-neon.sh
#
# - Usa pg_dump/pg_restore de la imagen postgis/postgis:18 (Neon corre PG 18;
#   un pg_dump más viejo no puede volcar un servidor más nuevo).
# - Excluye lo que solo existe en Neon: la extensión pg_session_jwt (crea el
#   esquema `auth`) y el esquema `pgrst` (PostgREST de Neon). Todo lo demás,
#   incluido `neon_auth` y las tablas de historial de Flyway, se copia tal cual.
# - Se niega a restaurar sobre una base que ya tenga datos de la app.
# - Deja una copia del dump en backups/ (ignorado por git: contiene datos personales).
set -euo pipefail

: "${NEON_URL:?Define NEON_URL con la connection string directa (sin -pooler) de Neon}"

IMAGE=postgis/postgis:18-3.6
DB=predicador
DUMP_DIR=backups
DUMP_FILE="$DUMP_DIR/neon-$(date +%Y%m%d-%H%M%S).dump"

cd "$(dirname "$0")/../.."
mkdir -p "$DUMP_DIR"
chmod 700 "$DUMP_DIR"

echo "==> Levantando postgres"
docker compose up -d postgres
until [ "$(docker inspect -f '{{.State.Health.Status}}' postgres)" = healthy ]; do sleep 2; done

db_user=$(docker compose exec -T postgres printenv POSTGRES_USER)
psql_local() { docker compose exec -T postgres psql -U "$db_user" -d "$DB" -XAt "$@"; }

if [ "$(psql_local -c "select to_regclass('public.manzanas_territorio') is not null")" = t ]; then
  echo "ERROR: la base local ya tiene datos (manzanas_territorio existe). Abortando." >&2
  echo "Para empezar de cero: docker compose down && docker volume rm <proyecto>_postgres_data" >&2
  exit 1
fi

echo "==> Volcando Neon en $DUMP_FILE"
docker run --rm -e NEON_URL "$IMAGE" sh -c \
  'pg_dump "$NEON_URL" -Fc --no-owner --no-privileges --exclude-extension=pg_session_jwt --exclude-schema=pgrst' \
  > "$DUMP_FILE"
chmod 600 "$DUMP_FILE"

echo "==> Restaurando en el contenedor postgres"
docker compose exec -T postgres pg_restore -U "$db_user" -d "$DB" \
  --no-owner --no-privileges --exit-on-error < "$DUMP_FILE"

echo "==> Verificando filas por tabla (Neon vs local)"
count_query="select string_agg(t, E'\n' order by t) from (
  select format('%s.%s=%s', table_schema, table_name,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name), false, true, '')))[1]::text) t
  from information_schema.tables
  where table_schema in ('public', 'neon_auth') and table_type = 'BASE TABLE') x"
remote=$(docker run --rm -e NEON_URL "$IMAGE" psql "$NEON_URL" -XAtc "$count_query")
local_counts=$(psql_local -c "$count_query")
if diff <(echo "$remote") <(echo "$local_counts"); then
  echo "$local_counts"
  echo "==> OK: las cantidades coinciden. Dump guardado en $DUMP_FILE"
else
  echo "ERROR: las cantidades no coinciden (arriba el diff Neon vs local)." >&2
  exit 1
fi
