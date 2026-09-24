package com.predicador.territory.dto;

import java.util.List;

/**
 * Manzana tal como la ve el editor: id real de la base (estable, lo usan los
 * reportes), geometría GeoJSON 2D y los datos de calidad que el editor
 * muestra como advertencia (validez y manzanas con las que se superpone).
 */
public record ManzanaAdminResponse(
        Long id,
        Long territorio,
        String nombre,
        double areaM2,
        boolean valida,
        List<Long> solapaCon,
        String geometria
) {}
