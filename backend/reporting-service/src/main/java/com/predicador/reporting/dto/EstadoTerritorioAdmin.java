package com.predicador.reporting.dto;

import java.time.Instant;

/**
 * Estado actual de un territorio (su último reporte) para corregirlo desde el
 * panel: manzanas marcadas enteras y zonas marcadas por calles.
 */
public record EstadoTerritorioAdmin(
        long territorio,
        Instant fecha,
        String estado,
        String origen,
        String encargado,
        String manzanasIds,
        String geometriaParcial,
        String puntosParciales,
        Integer totalManzanas
) {}
