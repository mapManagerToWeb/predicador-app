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
