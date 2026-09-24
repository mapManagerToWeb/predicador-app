#!/usr/bin/env bash
# Seed one-shot de las bases de desarrollo locales desde Neon (SOLO LECTURA).
#
# - La fuente es Neon (producción): el script NO escribe/borra/modifica NADA
#   en Neon. Solo usa pg_dump, que es 100% read-only.
# - Restaura SOLO datos (--data-only) en las bases locales del servicio `db`
#   de docker-compose: territorio -> `predicador`, reporting -> `predicador_reporting`.
# - NO restaura las tablas de historial de Flyway (flyway_schema_history_*):
#   cada base local ya migró V0->Vn y su historial es la fuente de verdad local.
#
# Credenciales: lee NEON_DB_URL (formato jdbc:postgresql:// o postgresql://)
# desde $HOME/.predicador-neon-env (chmod 600, fuera del repo), o desde la
# variable de entorno NEON_DB_URL si está definida.
#
# Uso:  scripts/seed-local-from-neon.sh
set -euo pipefail

ENV_FILE="${NEON_ENV_FILE:-$HOME/.predicador-neon-env}"
if [[ -z "${NEON_DB_URL:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Falta credencial: define NEON_DB_URL o crea $ENV_FILE con NEON_DB_URL='jdbc:postgresql://...'" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi
[[ -n "${NEON_DB_URL:-}" ]] || { echo "NEON_DB_URL vacía" >&2; exit 1; }

# --- Normalización jdbc: -> URI libpq (quita params JDBC-only) ---------------
RAW="${NEON_DB_URL#jdbc:}"
HOST=$(printf '%s' "$RAW" | sed -E 's|postgresql://([^/?]*)/.*|\1|')
DB=$(printf '%s' "$RAW" | sed -E 's|postgresql://[^/?]*/([^?]*).*|\1|')
USER=$(printf '%s' "$RAW" | sed -E 's/.*[?&]user=([^&]*).*/\1/')
PASS=$(printf '%s' "$RAW" | sed -E 's/.*[?&]password=([^&]*).*/\1/')
SSLMODE=$(printf '%s' "$RAW" | sed -E 's/.*[?&]sslmode=([^&]*).*/\1/')
SSLMODE="${SSLMODE:-require}"

if [[ -n "$USER" && "$USER" != "$RAW" && -n "$PASS" ]]; then
  NURL="postgresql://${USER}:${PASS}@${HOST}/${DB}?sslmode=${SSLMODE}"
else
  # Ya estaba en formato authority o sin user/password en query
  NURL="${RAW%%&channelBinding=*}"
fi
echo "Fuente: ${HOST}/${DB} (read-only) — target local"

# --- Tablas por servicio ------------------------------------------------------
TERRITORY_TABLES=(app_meta manzana_s2_cover manzanas_territorio territorio_disuelto territory_settings)
REPORTING_TABLES=(encargados registro_predicacion whatsapp_delivery_idempotency)

count_table() { # $1=db local, $2=tabla
  docker compose exec -T db psql -U predicador -d "$1" -tAc "SELECT count(*) FROM $2" 2>/dev/null | tr -d ' '
}

docker compose ps -q db >/dev/null || { echo "Servicio db no está corriendo" >&2; exit 1; }

seed() { # $1=nombre servicio, $2=db local, resto=tablas
  local svc="$1" dbname="$2"; shift 2
  local args=()
  for t in "$@"; do args+=(--table="$t"); done
  echo "--- $svc -> $dbname"
  for t in "$@"; do echo "  antes: $t = $(count_table "$dbname" "$t")"; done
  # Neon es PostgreSQL 18.x: el dump corre con pg_dump 18 (postgres:18-alpine).
  # El restore usa psql 18 del MISMO contenedor, porque pg_dump 18 emite
  # meta-comandos \restrict que psql 16 (cliente local) no entiende.
  # --network container:db => localhost es el postgres local; el egress a Neon
  # sale por el netns del contenedor db (misma IP que el host).
  local pw
  pw=$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_PASSWORD"')
  docker run --rm -i --network container:db \
    -e NURL="$NURL" -e PGPASSWORD="$pw" "${DUMP_IMAGE:-postgres:18-alpine}" \
    /bin/sh -c "pg_dump --data-only --no-owner --no-privileges ${args[*]} \"\$NURL\" | grep -v '^SET transaction_timeout' | psql -v ON_ERROR_STOP=1 -q -h localhost -U predicador -d \"$dbname\"" \
    || { echo "FALLO seed $svc" >&2; exit 1; }
  for t in "$@"; do echo "  despues: $t = $(count_table "$dbname" "$t")"; done
}

echo "--- territory prep: app_meta local (sembrada por Flyway V3) se vacia; la de Neon es la coherente con los datos restaurados"
docker compose exec -T db psql -U predicador -d predicador -c 'DELETE FROM app_meta' >/dev/null

seed territory predicador "${TERRITORY_TABLES[@]}"
seed reporting predicador_reporting "${REPORTING_TABLES[@]}"

echo "SEED COMPLETO (solo lectura sobre Neon; datos restaurados en local)"