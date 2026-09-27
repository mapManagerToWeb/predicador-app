#!/usr/bin/env bash
# Restaura un respaldo hecho con respaldo.sh en el contenedor `postgres`.
#
# Uso:
#   scripts/db/restaurar.sh RESPALDO.dump.age LLAVE_PRIVADA.txt
#       Lo restaura en una base aparte (predicador_restaurada) para revisarlo,
#       sin tocar la de producción, y muestra cuántas filas tiene cada tabla.
#   scripts/db/restaurar.sh RESPALDO.dump.age LLAVE_PRIVADA.txt --reemplazar
#       Emergencia (p. ej. un servidor nuevo): detiene los servicios, reemplaza
#       la base `predicador` por el respaldo y los vuelve a levantar. Pide
#       confirmación escribiendo REEMPLAZAR.
#
# LLAVE_PRIVADA es el archivo que generó `age-keygen` (empieza con
# "AGE-SECRET-KEY-"). Nunca la subas al repositorio ni la dejes en el VPS.
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
RESPALDO="$(realpath "$1")"
LLAVE="$(realpath "$2")"
REEMPLAZAR="${3:-}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

command -v age >/dev/null 2>&1 || { echo "Falta 'age': sudo apt-get install -y age" >&2; exit 1; }
[ -s "$RESPALDO" ] || { echo "No existe o está vacío: $RESPALDO" >&2; exit 1; }
# Antes de tocar nada: la llave abre el respaldo y el contenido es un volcado válido.
age -d -i "$LLAVE" "$RESPALDO" | docker compose exec -T postgres pg_restore --list >/dev/null \
  || { echo "No se pudo abrir el respaldo con esa llave (¿llave equivocada o archivo dañado?)" >&2; exit 1; }

psql_en() {
  docker compose exec -T -e BASE="$1" postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$BASE" -Atc "$0"' "$2"
}

if [ "$REEMPLAZAR" = "--reemplazar" ]; then
  BASE=predicador
  echo "Esto REEMPLAZA la base de producción '$BASE' por el respaldo:"
  echo "  $RESPALDO"
  read -r -p "Escribe REEMPLAZAR para continuar: " respuesta
  [ "$respuesta" = "REEMPLAZAR" ] || { echo "Cancelado."; exit 1; }
  docker compose stop territory-service reporting-service
else
  BASE=predicador_restaurada
fi

echo "Creando la base '$BASE'…"
docker compose exec -T -e BASE="$BASE" postgres sh -c \
  'dropdb --if-exists --force -U "$POSTGRES_USER" "$BASE" && createdb -U "$POSTGRES_USER" -T template0 "$BASE"'

echo "Restaurando…"
age -d -i "$LLAVE" "$RESPALDO" | docker compose exec -T -e BASE="$BASE" postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$BASE" --no-owner --no-privileges --exit-on-error'

echo "Filas por tabla en '$BASE':"
for tabla in manzanas_territorio registro_predicacion encargados ciclo_territorios territory_settings app_config; do
  if [ "$(psql_en "$BASE" "select to_regclass('public.$tabla') is not null")" = "t" ]; then
    printf '  %-24s %s\n' "$tabla" "$(psql_en "$BASE" "select count(*) from public.$tabla")"
  fi
done

if [ "$REEMPLAZAR" = "--reemplazar" ]; then
  docker compose up -d territory-service reporting-service
  echo "Listo: la base '$BASE' quedó restaurada y los servicios se están levantando."
else
  echo "Listo. Para borrar esta copia de prueba:"
  echo "  docker compose exec -T postgres sh -c 'dropdb -U \"\$POSTGRES_USER\" $BASE'"
fi
