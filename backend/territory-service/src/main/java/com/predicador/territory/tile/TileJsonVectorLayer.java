package com.predicador.territory.tile;

import java.util.Map;

/**
 * Capa declarada en {@code vector_layers} del TileJSON: schema de
 * propiedades (whitelist sin PII) y rango de zooms donde la capa existe
 * en los tiles.
 *
 * @param id       nombre de la capa MVT ({@code manzana} / {@code territorio})
 * @param fields   propiedad → tipo ("Number" / "String")
 * @param minzoom  primer zoom con features de esta capa
 * @param maxzoom  último zoom con features de esta capa
 */
public record TileJsonVectorLayer(
        String id,
        Map<String, String> fields,
        Integer minzoom,
        Integer maxzoom) {
}