package com.predicador.territory.geojson;

import com.predicador.territory.repository.TerritoryRepository.ManzanaGeoJsonProjection;

import java.util.List;
import java.util.Map;

/**
 * Interface for serializing territory data to GeoJSON.
 *
 * <p>This is the seam that isolates the GeoJSON serialization logic from the
 * service layer. Production uses {@link HibernateSpatialTerritoryGeoJsonSerializer}
 * which consumes geometry already converted to GeoJSON by PostGIS
 * ({@code ST_AsGeoJSON}), so no WKB/WKT parsing happens in Java.</p>
 */
public interface TerritoryGeoJsonSerializer {

    /**
     * Serializes all territories to a single GeoJSON FeatureCollection.
     *
     * @param rows     manzanas with their PostGIS-generated GeoJSON geometry
     * @param colorMap territory number -> color
     * @return GeoJSON string
     */
    String serializeAll(List<ManzanaGeoJsonProjection> rows, Map<Long, String> colorMap);

    /**
     * Serializes a single territory's manzanas to GeoJSON.
     *
     * @param rows  manzanas with their PostGIS-generated GeoJSON geometry
     * @param color territory color
     * @return GeoJSON string
     */
    String serializeTerritory(List<ManzanaGeoJsonProjection> rows, String color);
}