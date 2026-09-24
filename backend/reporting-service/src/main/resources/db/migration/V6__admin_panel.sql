-- V6: panel de administración.
--
-- 1. inicio_sesion: cuándo empezó el encargado a marcar manzanas en la salida
--    que se reporta. Con fecha (envío) permite medir la duración de la salida
--    y el tiempo por manzana. NULL en los reportes anteriores a esta versión.
-- 2. Credenciales de encargados: PIN opcional (hash BCrypt), con bloqueo tras
--    intentos fallidos, y último acceso para el panel.
-- 3. app_config: ajustes del panel (p. ej. si el auto-registro está abierto).

ALTER TABLE registro_predicacion ADD COLUMN IF NOT EXISTS inicio_sesion TIMESTAMPTZ;

ALTER TABLE encargados ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(100);
ALTER TABLE encargados ADD COLUMN IF NOT EXISTS pin_actualizado_en TIMESTAMPTZ;
ALTER TABLE encargados ADD COLUMN IF NOT EXISTS pin_intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE encargados ADD COLUMN IF NOT EXISTS pin_bloqueado_hasta TIMESTAMPTZ;
ALTER TABLE encargados ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app_config (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_config (clave, valor) VALUES ('registro_abierto', 'true')
ON CONFLICT (clave) DO NOTHING;
