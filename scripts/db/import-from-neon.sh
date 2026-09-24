#!/bin/sh
# Importa la base de Neon en el contenedor `postgres`. Lo ejecuta el servicio
# `db-import` de docker-compose en cada `up`, antes de territory y reporting:
#
# - Si la base ya tiene datos de la app, no hace nada.
# - Si NEON_URL está vacío, no hace nada (base nueva; Flyway crea el esquema).
# - Si no, vuelca Neon con pg_dump 18 (excluye lo que solo existe en Neon: la
#   extensión pg_session_jwt, dueña del esquema `auth`, y el esquema `pgrst`)
#   y lo restaura en una sola transacción: si algo falla no queda nada a medias
#   y los servicios no arrancan. Luego compara filas por tabla contra Neon.
# - Deja una copia del dump en /backups (./backups en el host, ignorado por git:
#   contiene datos personales).
set -eu

export PGHOST=postgres PGDATABASE=predicador PGUSER="$DB_USERNAME" PGPASSWORD="$DB_PASSWORD"

if [ "$(psql -XAtc "select to_regclass('public.manzanas_territorio') is not null")" = t ]; then
  echo "db-import: la base ya tiene datos, no se importa nada."
  exit 0
fi

if [ -z "${NEON_URL:-}" ]; then
  echo "db-import: base vacía y NEON_URL sin definir; se deja vacía (Flyway crea el esquema)."
  exit 0
fi

dump="/backups/neon-$(date +%Y%m%d-%H%M%S).dump"
echo "db-import: volcando Neon en $dump"
pg_dump "$NEON_URL" -Fc --no-owner --no-privileges \
  --exclude-extension=pg_session_jwt --exclude-schema=pgrst -f "$dump"
chmod 644 "$dump"

echo "db-import: restaurando"
pg_restore -d "$PGDATABASE" --no-owner --no-privileges --exit-on-error --single-transaction "$dump"

echo "db-import: verificando filas por tabla (Neon vs local)"
count_query="select string_agg(t, E'\n' order by t) from (
  select format('%s.%s=%s', table_schema, table_name,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name), false, true, '')))[1]::text) t
  from information_schema.tables
  where table_schema in ('public', 'neon_auth') and table_type = 'BASE TABLE') x"
psql "$NEON_URL" -XAtc "$count_query" > /tmp/remote.counts
psql -XAtc "$count_query" > /tmp/local.counts
if ! diff /tmp/remote.counts /tmp/local.counts; then
  echo "db-import: ERROR, las cantidades no coinciden (arriba el diff Neon vs local)." >&2
  exit 1
fi
cat /tmp/local.counts
echo "db-import: OK, importación completa."
