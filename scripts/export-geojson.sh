#!/bin/bash
# Exporta el GeoJSON de territorios desde la base de datos a un archivo local.
# Uso: ./scripts/export-geojson.sh [archivo_salida]
# Default: territorios.geojson (raíz del proyecto)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="${1:-$PROJECT_ROOT/territorios.geojson}"

DB_URL="${DB_URL:-}"
DB_USERNAME="${DB_USERNAME:-}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [[ -z "$DB_URL" || -z "$DB_USERNAME" || -z "$DB_PASSWORD" ]]; then
  echo "Error: DB_URL, DB_USERNAME y DB_PASSWORD deben estar configurados."
  echo "Ejemplo: DB_URL=... DB_USERNAME=... DB_PASSWORD=... $0"
  exit 1
fi

# Extraer host y nombre de la base de datos de la URL JDBC
# Formato: jdbc:postgresql://host/db?params
PG_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_URL#jdbc:postgresql://}"

SQL="SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(ST_Force2D(m.geometry))::json, 'properties', json_build_object('id', m.territorio_padre || '-' || COALESCE(m.nombre_bloque, ''), 'nombre_bloque', COALESCE(m.nombre_bloque, ''), 'territorio_padre', m.territorio_padre, 'color', ts.color))), '[]'::json))::text FROM manzanas_territorio m LEFT JOIN territory_settings ts ON ts.territory_number = m.territorio_padre WHERE m.territorio_padre IS NOT NULL;"

echo "Exportando GeoJSON a $OUTPUT_FILE..."
docker run --rm postgres:16-alpine psql "$PG_URL" -t -c "$SQL" > "$OUTPUT_FILE"

SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
FEATURES=$(python3 -c "import json; d=json.load(open('$OUTPUT_FILE')); print(len(d['features']))" 2>/dev/null || echo "?")
echo "✅ Exportado: $FEATURES features, tamaño: $SIZE"
