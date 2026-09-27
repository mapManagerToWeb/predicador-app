package com.predicador.territory.dto;

import java.util.List;

/**
 * Lightweight per-territory metadata served by
 * {@code GET /api/v1/territories/metadata}. Replaces the non-geometry
 * information the frontend previously derived from the bulk GeoJSON
 * snapshot (retired in F5) — counts, bounds, label positions, fid bridge —
 * without carrying any per-feature geometry.
 *
 * @param numero       territory number ({@code territorio_padre})
 * @param nombre       display name ({@code "Territorio {numero}"}, parity
 *                     with {@link TerritoryDto#name()})
 * @param color        resolved color — assigned or palette fallback, same
 *                     semantics as {@code GET /territories/colors}
 * @param bounds       bbox {@code [minLng, minLat, maxLng, maxLat]} over the
 *                     territory's manzanas; {@code null} when the territory
 *                     has no geometry to derive a bbox from
 * @param center       representative position {@code [lng, lat]} from
 *                     {@code ST_PointOnSurface} (guaranteed inside the
 *                     polygon — never a centroid that could fall outside a
 *                     concave territory); {@code null} when no geometry
 * @param manzanaCount number of manzana features in the territory
 * @param fids         feature ids of the territory's manzanas (the
 *                     {@code manzanas_territorio} PK) — matches both the MVT
 *                     tile feature id and the GeoJSON {@code fid} property,
 *                     so fid→territory bridging stays compatible
 */
public record TerritoryMetadataDto(
        Long numero,
        String nombre,
        String color,
        List<Double> bounds,
        List<Double> center,
        long manzanaCount,
        List<Long> fids
) {}
