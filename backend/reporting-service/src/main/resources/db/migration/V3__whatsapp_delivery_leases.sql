ALTER TABLE whatsapp_delivery_idempotency
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE whatsapp_delivery_idempotency
    ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
ALTER TABLE whatsapp_delivery_idempotency
    ADD COLUMN IF NOT EXISTS status_code INTEGER;

UPDATE whatsapp_delivery_idempotency
SET status = CASE WHEN success THEN 'SUCCEEDED' ELSE 'FAILED' END
WHERE status IS NULL;

ALTER TABLE whatsapp_delivery_idempotency
    ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
ALTER TABLE whatsapp_delivery_idempotency
    ALTER COLUMN status SET NOT NULL;
