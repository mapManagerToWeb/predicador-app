-- V0: Initial schema for territory-service.
-- Idempotent: safe to re-run (uses IF NOT EXISTS).
-- Note: with baseline-on-migrate + baseline-version 0, Flyway skips V0 on
-- existing databases. These statements only create new objects.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS manzanas_territorio (
    id              BIGINT PRIMARY KEY,
    territorio_padre BIGINT,
    nombre_bloque   VARCHAR(255),
    geometry        GEOMETRY(GeometryZ, 4326)
);

CREATE TABLE IF NOT EXISTS territory_settings (
    territory_number BIGINT PRIMARY KEY,
    color            VARCHAR(7) NOT NULL
);
