#!/usr/bin/env bash
# Respaldo cifrado de la base de producción (contenedor `postgres` del compose).
#
# Uso (desde cualquier carpeta, en el VPS):
#   scripts/db/respaldo.sh local    Guarda backups/predicador-AAAAMMDD-HHMMSS.dump.age
#                                   y conserva los últimos $RESPALDO_CONSERVAR (14).
#   scripts/db/respaldo.sh stdout   Escribe el respaldo cifrado por la salida estándar.
#                                   Lo usa GitHub Actions por SSH (ver
#                                   .github/workflows/respaldo-bdd.yml): la llave SSH
#                                   de GitHub solo puede ejecutar este comando.
#
# El respaldo sale ya cifrado con age para las llaves públicas de
# .github/backup/age.pub (una por línea): solo quien tenga una llave privada
# correspondiente puede abrirlo. El volcado en claro nunca toca el disco.
# Formato: pg_dump --format=custom (comprimido); se restaura con restaurar.sh.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

MODO="${1:-${SSH_ORIGINAL_COMMAND:-local}}"
# Por SSH con comando forzado, lo que pida el cliente llega en SSH_ORIGINAL_COMMAND:
# se ignora salvo para elegir "stdout"; nunca se ejecuta.
case "$MODO" in
  stdout|respaldo) MODO=stdout ;;
  local) ;;
  *) echo "Uso: $0 local|stdout" >&2; exit 2 ;;
esac

LLAVES="${RESPALDO_LLAVES:-$RAIZ/.github/backup/age.pub}"
CONSERVAR="${RESPALDO_CONSERVAR:-14}"
CARPETA="${RESPALDO_CARPETA:-$RAIZ/backups}"

# age del sistema o el instalado en el proyecto por scripts/db/instalar-age.sh.
if ! command -v age >/dev/null 2>&1; then
  if [ -x "$RAIZ/.herramientas/age/age" ]; then
    PATH="$RAIZ/.herramientas/age:$PATH"
  else
    echo "Falta 'age' (cifrado) en el VPS. Instálalo con: $RAIZ/scripts/db/instalar-age.sh" >&2
    exit 1
  fi
fi
if ! grep -q '^age1' "$LLAVES" 2>/dev/null; then
  echo "No hay llaves públicas de age en $LLAVES" >&2
  exit 1
fi

volcar() {
  # pg_dump del propio contenedor (misma versión que el servidor). --no-owner:
  # se puede restaurar con otro usuario en un servidor nuevo.
  docker compose exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-privileges'
}

if [ "$MODO" = stdout ]; then
  volcar | age -R "$LLAVES"
  exit 0
fi

mkdir -p "$CARPETA"
chmod 700 "$CARPETA"
ARCHIVO="$CARPETA/predicador-$(date +%Y%m%d-%H%M%S).dump.age"
TEMPORAL="$ARCHIVO.parcial"
trap 'rm -f "$TEMPORAL"' EXIT
volcar | age -R "$LLAVES" > "$TEMPORAL"
mv "$TEMPORAL" "$ARCHIVO"
chmod 600 "$ARCHIVO"
echo "Respaldo guardado: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# Rotación: quedan los $CONSERVAR más recientes.
ls -1t "$CARPETA"/predicador-*.dump.age 2>/dev/null | tail -n +"$((CONSERVAR + 1))" | xargs -r rm -f --
