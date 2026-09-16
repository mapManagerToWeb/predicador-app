-- V3: S2 cover + territorios disueltos + versión de datos para el pipeline
-- de vector tiles (SPEC-map-vector-tiles.md, F1). Historial propio de
-- territory-service (nunca editar migraciones aplicadas).

-- Cobertura S2 nivel fijo 14 de cada manzana (bbox). btree sobre s2_cell_id:
-- lookup candidato por tile sin falsos negativos (las celdas a nivel fijo
-- particionan la esfera). ST_Intersects queda como filtro fino.
CREATE TABLE manzana_s2_cover (
  manzana_id   BIGINT NOT NULL REFERENCES manzanas_territorio(id) ON DELETE CASCADE,
  s2_cell_id   BIGINT NOT NULL,
  PRIMARY KEY (manzana_id, s2_cell_id)
);
CREATE INDEX idx_manzana_s2_cover_cell ON manzana_s2_cover (s2_cell_id);

-- Polígonos por territorio disueltos en el servidor (ST_Union) para la capa
-- `territorio` de bajo zoom (z <= 11): pocas filas, GiST directo.
CREATE TABLE territorio_disuelto (
  territorio_padre BIGINT PRIMARY KEY,
  geometry         geometry(MultiPolygon, 4326) NOT NULL,
  total_manzanas   INT NOT NULL
);

-- Versión de datos: los mutadores la bumpan; las claves de caché y los ETags
-- de los tiles la incorporan (nunca dato viejo con ETag nuevo). s2_backfill_done
-- es el guard idempotente del backfill de arranque.
CREATE TABLE app_meta (k TEXT PRIMARY KEY, v BIGINT NOT NULL);
INSERT INTO app_meta (k, v) VALUES ('data_version', 1) ON CONFLICT (k) DO NOTHING;