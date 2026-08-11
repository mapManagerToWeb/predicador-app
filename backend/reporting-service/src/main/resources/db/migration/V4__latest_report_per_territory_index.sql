-- Soporta la query nativa findLatestByTerritorioNumeroIn (DISTINCT ON):
-- el índice compuesto (territorio_numero, fecha DESC, id DESC) deja que
-- Postgres entregue el último reporte por territorio sin ordenar en memoria.
CREATE INDEX IF NOT EXISTS idx_registro_predicacion_territorio_fecha
    ON registro_predicacion (territorio_numero, fecha DESC, id DESC);