package com.predicador.territory.geojson;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.predicador.territory.repository.TerritoryRepository.ManzanaGeoJsonProjection;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Production implementation that builds GeoJSON from geometry already
 * converted by PostGIS via {@code ST_AsGeoJSON(ST_Force2D(geometry))}.
 *
 * <p>PostGIS serializes every geometry type (Polygon, MultiPolygon, holes,
 * Z/M coordinates) correctly, so the application never parses WKB/WKT.
 * Features whose geometry failed to convert (e.g. null) are skipped.</p>
 */
@Component
public class HibernateSpatialTerritoryGeoJsonSerializer implements TerritoryGeoJsonSerializer {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String serializeAll(List<ManzanaGeoJsonProjection> rows, Map<Long, String> colorMap) {
        ArrayNode features = objectMapper.createArrayNode();

        for (ManzanaGeoJsonProjection row : rows) {
            JsonNode feature = buildFeature(row, colorMap.getOrDefault(row.getTerritorioPadre(), "#3b82f6"));
            if (feature != null) {
                features.add(feature);
            }
        }

        ObjectNode fc = objectMapper.createObjectNode();
        fc.put("type", "FeatureCollection");
        fc.set("features", features);
        return fc.toString();
    }

    @Override
    public String serializeTerritory(List<ManzanaGeoJsonProjection> rows, String color) {
        ArrayNode features = objectMapper.createArrayNode();

        for (ManzanaGeoJsonProjection row : rows) {
            JsonNode feature = buildFeature(row, color);
            if (feature != null) {
                features.add(feature);
            }
        }

        ObjectNode fc = objectMapper.createObjectNode();
        fc.put("type", "FeatureCollection");
        fc.set("features", features);
        return fc.toString();
    }

    private JsonNode buildFeature(ManzanaGeoJsonProjection row, String color) {
        String geometryText = row.getGeoJson();
        if (geometryText == null || geometryText.isBlank()) {
            return null;
        }

        try {
            JsonNode geometry = objectMapper.readTree(geometryText);
            if (geometry == null || !geometry.isObject() || !geometry.hasNonNull("type")) {
                return null;
            }

            ObjectNode feature = objectMapper.createObjectNode();
            feature.put("type", "Feature");

            ObjectNode properties = objectMapper.createObjectNode();
            properties.put("id", row.getTerritorioPadre() + "-" + blankToEmpty(row.getNombreBloque()));
            properties.put("nombre_bloque", blankToEmpty(row.getNombreBloque()));
            properties.put("territorio_padre", row.getTerritorioPadre());
            properties.put("color", color);
            feature.set("properties", properties);
            feature.set("geometry", geometry);
            return feature;
        } catch (Exception e) {
            // Skip geometries that could not be serialized.
            return null;
        }
    }

    private String blankToEmpty(String value) {
        return value == null ? "" : value;
    }
}
