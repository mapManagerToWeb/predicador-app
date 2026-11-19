#!/usr/bin/env bash
# Deja la app accesible desde el teléfono en un solo comando.
#
# Levanta el dev server de Angular, abre un túnel público (Cloudflare quick
# tunnel) y recrea el `api-gateway` con el origen del túnel en
# CORS_ALLOWED_ORIGINS, que es lo que hoy hay que hacer a mano cada vez.
#
# Uso:
#   scripts/dev-tunel.sh          Levanta todo e imprime la URL pública.
#   scripts/dev-tunel.sh --stop   Detiene el dev server y el túnel.
#   scripts/dev-tunel.sh --url    Solo imprime la URL del túnel en curso.
#
# El túnel apunta a http://[::1]:4200 a propósito: el dev server de Angular
# escucha solo en IPv6, así que con `localhost` cloudflared resuelve a veces a
# 127.0.0.1 y responde 502 de forma intermitente.
#
# La URL cambia en cada arranque: por eso el gateway se recrea siempre.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

PUERTO=4200
ORIGEN="http://[::1]:${PUERTO}"
ESTADO="${TMPDIR:-/tmp}/predicador-dev-tunel"
# El binario sí sobrevive a los reinicios del equipo; los logs y pids no.
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/predicador-dev-tunel"
LOG_NG="$ESTADO/ng-serve.log"
LOG_CF="$ESTADO/cloudflared.log"
PID_CF="$ESTADO/cloudflared.pid"
PID_NG="$ESTADO/ng-serve.pid"
mkdir -p "$ESTADO" "$CACHE"

url_tunel() {
  # Sin coincidencia, grep sale con 1 y `pipefail` abortaría el script.
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_CF" 2>/dev/null | head -1 || true
}

escuchando() {
  lsof -nP -iTCP:"$PUERTO" -sTCP:LISTEN >/dev/null 2>&1
}

detener() {
  if [[ -f "$PID_CF" ]]; then
    kill "$(cat "$PID_CF")" 2>/dev/null || true
    rm -f "$PID_CF"
  fi
  if [[ -f "$PID_NG" ]]; then
    kill "$(cat "$PID_NG")" 2>/dev/null || true
    rm -f "$PID_NG"
  fi
  # El dev server deja un proceso hijo con el nombre del proyecto.
  pkill -f "ng serve (territory-frontend)" 2>/dev/null || true
  echo "dev server y túnel detenidos"
}

case "${1:-}" in
  --stop)
    detener
    exit 0
    ;;
  --url)
    url_tunel
    exit 0
    ;;
  "") ;;
  *)
    echo "Opción desconocida: $1 (usá --stop o --url)" >&2
    exit 2
    ;;
esac

# --- cloudflared -----------------------------------------------------------
# No se instala nada global: se reusa el binario cacheado, el que esté en el
# PATH, o en $CLOUDFLARED. Si no hay ninguno, se baja el release oficial a
# ~/.cache para que sobreviva a los reinicios del equipo.
binario_cloudflared() {
  if [[ -n "${CLOUDFLARED:-}" && -x "${CLOUDFLARED}" ]]; then
    echo "$CLOUDFLARED"
    return
  fi
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return
  fi
  if [[ -x "$CACHE/cloudflared" ]]; then
    echo "$CACHE/cloudflared"
    return
  fi
  # Reusar el que haya bajado `untun` en algún momento.
  local encontrado
  encontrado="$(find "${TMPDIR:-/tmp}/node-untun" -maxdepth 1 -name 'cloudflared.*' -print -quit 2>/dev/null || true)"
  if [[ -n "$encontrado" ]]; then
    cp "$encontrado" "$CACHE/cloudflared"
    chmod +x "$CACHE/cloudflared"
    echo "$CACHE/cloudflared"
    return
  fi

  local arquitectura
  case "$(uname -m)" in
    arm64) arquitectura=arm64 ;;
    x86_64) arquitectura=amd64 ;;
    *)
      echo "Arquitectura no soportada: $(uname -m)" >&2
      exit 1
      ;;
  esac
  echo "Descargando cloudflared para darwin-$arquitectura..." >&2
  if ! curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arquitectura}.tgz" \
    | tar -xz -C "$CACHE" cloudflared; then
    echo "No se pudo descargar cloudflared." >&2
    exit 1
  fi
  chmod +x "$CACHE/cloudflared"
  echo "$CACHE/cloudflared"
}

# --- dev server ------------------------------------------------------------
if escuchando; then
  echo "dev server ya escuchando en :$PUERTO"
else
  echo "Levantando dev server..."
  (
    cd territory-frontend
    NG_ALLOWED_HOSTS="localhost,127.0.0.1,*.tunnelmole.net,*.trycloudflare.com" \
      nohup pnpm start >"$LOG_NG" 2>&1 &
    echo $! >"$PID_NG"
  )
  for _ in $(seq 1 120); do
    escuchando && break
    sleep 1
  done
  if ! escuchando; then
    echo "El dev server no arrancó. Mirá $LOG_NG" >&2
    exit 1
  fi
  echo "dev server listo"
fi

# --- túnel -----------------------------------------------------------------
CF="$(binario_cloudflared)"
# Un túnel anterior dejaría dos y la URL impresa no sería la vigente.
if [[ -f "$PID_CF" ]]; then
  kill "$(cat "$PID_CF")" 2>/dev/null || true
  sleep 1
fi
rm -f "$LOG_CF"
echo "Abriendo túnel..."
nohup "$CF" tunnel --url "$ORIGEN" >"$LOG_CF" 2>&1 &
echo $! >"$PID_CF"

URL=""
for _ in $(seq 1 120); do
  URL="$(url_tunel || true)"
  [[ -n "$URL" ]] && break
  sleep 1
done
if [[ -z "$URL" ]]; then
  echo "El túnel no entregó una URL. Mirá $LOG_CF" >&2
  exit 1
fi

# --- gateway con el origen nuevo -------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "Docker no responde; abriendo Docker Desktop..."
  open -a Docker
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker sigue sin responder. La URL existe pero la API no." >&2
  echo "$URL"
  exit 1
fi

echo "Levantando el backend con el origen del túnel..."
# `up -d` sin servicio: el cambio de CORS recrea el gateway y, si algo está
# abajo (territory/reporting), también los levanta.
CORS_ALLOWED_ORIGINS="http://localhost:${PUERTO},${URL}" \
  docker compose up -d >/dev/null

echo
echo "URL: $URL"
echo "Esperando a que la API responda..."
for _ in $(seq 1 40); do
  if curl -fsS -m 10 "$URL/api/v1/encargados/registro" 2>/dev/null | grep -q abierto; then
    echo "Listo. Abrí la URL en el teléfono."
    exit 0
  fi
  sleep 5
done
echo "La URL responde, pero la API todavía no (el gateway tarda ~30 s en registrarse en Eureka)."
echo "Probá de nuevo en un minuto; el CORS ya quedó configurado."
