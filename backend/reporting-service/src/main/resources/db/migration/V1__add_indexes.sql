CREATE INDEX IF NOT EXISTS idx_registro_predicacion_fecha ON registro_predicacion(fecha);
CREATE INDEX IF NOT EXISTS idx_registro_predicacion_territorio ON registro_predicacion(territorio_numero);
CREATE INDEX IF NOT EXISTS idx_registro_predicacion_encargado ON registro_predicacion(encargado_id);
CREATE INDEX IF NOT EXISTS idx_encargados_activo ON encargados(activo);
