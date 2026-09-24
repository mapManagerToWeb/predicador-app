package com.predicador.reporting.dto;

import java.time.Instant;

/**
 * Estado de un territorio para el visor público (sin iniciar sesión). Solo
 * datos del territorio: nunca nombres ni teléfonos de encargados.
 *
 * @param manzanasIds      manzanas marcadas en el último reporte (ids separados por coma)
 * @param geometriaParcial zonas parciales del último reporte (GeoJSON), o null
 */
public record EstadoTerritorioPublico(
        long territorio,
        Instant ultimoTrabajo,
        Instant ultimoCompletado,
        String estado,
        Integer manzanasMarcadas,
        Integer totalManzanas,
        String manzanasIds,
        String geometriaParcial
) {}
