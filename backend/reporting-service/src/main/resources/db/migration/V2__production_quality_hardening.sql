CREATE UNIQUE INDEX IF NOT EXISTS ux_encargados_natural_identity
    ON encargados (lower(trim(nombre)), lower(trim(apellido)));

CREATE TABLE IF NOT EXISTS whatsapp_delivery_idempotency (
    idempotency_key VARCHAR(200) PRIMARY KEY,
    success BOOLEAN NOT NULL,
    message_id VARCHAR(200),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
