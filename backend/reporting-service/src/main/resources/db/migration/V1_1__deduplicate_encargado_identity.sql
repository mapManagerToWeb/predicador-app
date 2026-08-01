-- Keep the lowest encargados.id for each normalized name/apellido identity.
-- Historical reports are remapped before duplicate rows are removed.
WITH ranked AS (
    SELECT id,
           min(id) OVER (
               PARTITION BY lower(trim(nombre)), lower(trim(apellido))
           ) AS retained_id,
           row_number() OVER (
               PARTITION BY lower(trim(nombre)), lower(trim(apellido))
               ORDER BY id
           ) AS duplicate_rank
    FROM encargados
)
UPDATE registro_predicacion report
SET encargado_id = ranked.retained_id
FROM ranked
WHERE report.encargado_id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY lower(trim(nombre)), lower(trim(apellido))
               ORDER BY id
           ) AS duplicate_rank
    FROM encargados
)
DELETE FROM encargados e
USING ranked r
WHERE e.id = r.id
  AND r.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_encargados_natural_identity
    ON encargados (lower(trim(nombre)), lower(trim(apellido)));
