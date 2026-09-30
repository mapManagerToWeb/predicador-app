-- V8: el administrador corrige o anula el reporte de una salida (ADR 0014).
--
-- 1. anulado_en: el reporte quedó sin efecto (se equivocó el encargado). No se
--    borra: queda en el historial, pero no cuenta para el estado del
--    territorio, el S-13 ni los informes.
-- 2. reemplaza_a: el reporte corregido que el administrador guardó en lugar
--    de otro (mismo encargado y fecha, con las marcas correctas).

ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ;
ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS reemplaza_a INTEGER;

-- El último reporte vigente por territorio (el estado actual).
CREATE INDEX IF NOT EXISTS idx_registro_predicacion_vigentes
    ON registro_predicacion (territorio_numero, fecha DESC NULLS LAST, id DESC)
    WHERE anulado_en IS NULL;
