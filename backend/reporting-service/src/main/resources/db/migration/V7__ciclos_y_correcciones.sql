-- V7: ciclos de territorios (S-13) y correcciones del administrador.
--
-- 1. origen: quién escribió el reporte. 'salida' = un encargado desde el mapa;
--    'correccion' = el administrador corrigió el estado actual de un territorio
--    (p. ej. desmarcar una manzana marcada por error); 'reinicio' = cierre de
--    ciclo (el territorio vuelve a empezar). Nada se borra: el estado de un
--    territorio sigue siendo su último reporte, y el historial queda completo.
-- 2. nota: motivo que escribe el administrador en correcciones y reinicios.
-- 3. ciclo_territorios: cada vuelta completa a todos los territorios. Al
--    cerrarse guarda un resumen (JSON) del estado de cada territorio.

ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'salida';
ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS nota TEXT;

CREATE TABLE IF NOT EXISTS ciclo_territorios (
    id        BIGSERIAL PRIMARY KEY,
    inicio    TIMESTAMPTZ NOT NULL,
    fin       TIMESTAMPTZ,
    nota      TEXT,
    resumen   TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un solo ciclo abierto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ciclo_territorios_abierto
    ON ciclo_territorios ((fin IS NULL)) WHERE fin IS NULL;

-- El primer ciclo empieza con el primer reporte registrado.
INSERT INTO ciclo_territorios (inicio)
SELECT COALESCE(min(fecha), CURRENT_TIMESTAMP) FROM registro_predicacion
WHERE NOT EXISTS (SELECT 1 FROM ciclo_territorios);
