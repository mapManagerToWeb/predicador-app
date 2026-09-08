-- DEPRECATED: This file is deprecated. Use the Flyway migration instead:
-- db/migration/V5__convert_geometry_columns.sql
-- This file is kept for reference only. Do not execute directly.
-- Flyway will track and execute the migration automatically.

ALTER TABLE registro_predicacion DROP CONSTRAINT IF EXISTS registro_predicacion_manzana_id_fkey;
ALTER TABLE registro_predicacion ALTER COLUMN geometria_parcial TYPE TEXT;
ALTER TABLE registro_predicacion ALTER COLUMN manzana_id TYPE TEXT USING manzana_id::text;
ALTER TABLE registro_predicacion ALTER COLUMN puntos_parciales TYPE TEXT;
ALTER TABLE registro_predicacion ALTER COLUMN manzanas_ids TYPE TEXT;
