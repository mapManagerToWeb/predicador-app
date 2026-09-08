-- V0: Initial schema for reporting-service.
-- Idempotent: safe to re-run (uses IF NOT EXISTS).
-- Note: with baseline-on-migrate + baseline-version 0, Flyway skips V0 on
-- existing databases. These statements only create new objects.
-- V2 and V3 are also idempotent and will coexist safely with this V0.

CREATE TABLE IF NOT EXISTS registro_predicacion (
    id                 SERIAL PRIMARY KEY,
    manzana_id         TEXT,
    fecha              TIMESTAMPTZ,
    encargado_nombre   VARCHAR(255),
    encargado_apellido VARCHAR(255),
    session_time       VARCHAR(255),
    estado             VARCHAR(255),
    territorio_numero  BIGINT,
    encargado_id       BIGINT,
    total_manzanas     INTEGER,
    manzanas_marcadas  INTEGER,
    tipo_sesion        VARCHAR(255),
    geometria_parcial  TEXT,
    puntos_parciales   TEXT,
    manzanas_ids       TEXT,
    creado_en          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS encargados (
    id             BIGSERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    apellido       VARCHAR(100) NOT NULL,
    avatar         INTEGER DEFAULT 1,
    telefono       VARCHAR(20),
    activo         BOOLEAN DEFAULT TRUE,
    creado_en      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_delivery_idempotency (
    idempotency_key VARCHAR(200) PRIMARY KEY,
    success         BOOLEAN NOT NULL,
    status          VARCHAR(20) DEFAULT 'IN_PROGRESS',
    message_id      VARCHAR(200),
    error           TEXT,
    status_code     INTEGER,
    lease_until     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
