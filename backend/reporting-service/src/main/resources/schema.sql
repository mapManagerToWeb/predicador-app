ALTER TABLE registro_predicacion DROP CONSTRAINT IF EXISTS registro_predicacion_manzana_id_fkey;
ALTER TABLE registro_predicacion ALTER COLUMN geometria_parcial TYPE TEXT;
ALTER TABLE registro_predicacion ALTER COLUMN manzana_id TYPE TEXT USING manzana_id::text;
ALTER TABLE registro_predicacion ALTER COLUMN puntos_parciales TYPE TEXT;
ALTER TABLE registro_predicacion ALTER COLUMN manzanas_ids TYPE TEXT;
