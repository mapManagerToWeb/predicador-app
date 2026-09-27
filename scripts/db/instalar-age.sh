#!/usr/bin/env bash
# Instala age (cifrado de los respaldos) dentro del proyecto, en .herramientas/,
# sin sudo y sin depender de la versión del sistema (el paquete `age` de apt solo
# existe desde Ubuntu 22.04 y Oracle Linux no lo trae). Descarga el binario
# oficial y verifica su SHA-256: si no coincide, no instala nada.
# respaldo.sh y restaurar.sh lo usan si `age` no está en el sistema.
set -euo pipefail

VERSION=v1.2.1
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESTINO="$RAIZ/.herramientas/age"

case "$(uname -m)" in
  aarch64|arm64) ARQ=arm64; SUMA=57fd79a7ece5fe501f351b9dd51a82fbee1ea8db65a8839db17f5c080245e99f ;;
  x86_64|amd64)  ARQ=amd64; SUMA=7df45a6cc87d4da11cc03a539a7470c15b1041ab2b396af088fe9990f7c79d50 ;;
  *) echo "Arquitectura no soportada: $(uname -m)" >&2; exit 1 ;;
esac

if [ -x "$DESTINO/age" ] && "$DESTINO/age" --version 2>/dev/null | grep -q "${VERSION#v}"; then
  echo "age ${VERSION} ya está instalado en $DESTINO"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
URL="https://github.com/FiloSottile/age/releases/download/${VERSION}/age-${VERSION}-linux-${ARQ}.tar.gz"
echo "Descargando $URL"
curl -fsSL -o "$TMP/age.tgz" "$URL"
echo "$SUMA  $TMP/age.tgz" | sha256sum -c --quiet - || { echo "La descarga no coincide con la suma esperada: no se instala." >&2; exit 1; }
tar -xzf "$TMP/age.tgz" -C "$TMP"
mkdir -p "$DESTINO"
install -m 755 "$TMP/age/age" "$TMP/age/age-keygen" "$DESTINO/"
echo "age $("$DESTINO/age" --version) instalado en $DESTINO"
