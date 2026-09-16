package com.predicador.territory.tile;

import java.util.List;

/**
 * TileJSON 3.0 (https://github.com/mapbox/tilejson-spec/tree/master/3.0.0).
 * Propiedades extra son ignoradas por los consumidores, así que el record
 * se mantiene mínimo y explícito.
 *
 * @param tilejson     versión del spec ("3.0.0")
 * @param name         nombre del dataset
 * @param minzoom      zoom mínimo servible
 * @param maxzoom      zoom máximo servible
 * @param bounds       [minlon, minlat, maxlon, maxlat] en grados (WGS-84)
 * @param tiles        plantillas de URL de tiles (xyz)
 * @param vectorLayers descripción de capas y campos (schema de propiedades)
 */
public record TileJson(
        String tilejson,
        String name,
        int minzoom,
        int maxzoom,
        double[] bounds,
        List<String> tiles,
        List<TileJsonVectorLayer> vector_layers) {

    public TileJson {
        if (bounds != null && bounds.length != 4) {
            throw new IllegalArgumentException("bounds debe tener 4 elementos [minlon, minlat, maxlon, maxlat]");
        }
    }
}