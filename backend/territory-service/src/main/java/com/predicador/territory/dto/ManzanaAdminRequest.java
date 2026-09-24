package com.predicador.territory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Alta o edición de una manzana desde el editor del panel de administración.
 *
 * <p>{@code geometria} es una geometría GeoJSON (Polygon o MultiPolygon, en
 * WGS84) serializada como texto: PostGIS la parsea con
 * {@code ST_GeomFromGeoJSON}, así que Java no necesita modelar coordenadas.
 * En una edición puede venir {@code null} para conservar la geometría actual.</p>
 */
public record ManzanaAdminRequest(
        @NotNull(message = "territorio es obligatorio")
        @PositiveOrZero(message = "territorio debe ser >= 0")
        Long territorio,
        @NotBlank(message = "nombre es obligatorio")
        @Size(max = 60, message = "nombre demasiado largo")
        String nombre,
        @Size(max = 500_000, message = "geometría demasiado grande")
        String geometria
) {}
