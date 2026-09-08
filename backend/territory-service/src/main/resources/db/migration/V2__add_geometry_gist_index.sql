CREATE INDEX IF NOT EXISTS idx_manzanas_territorio_geometry_gist
ON manzanas_territorio
USING GIST (geometry);
