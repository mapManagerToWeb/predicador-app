package com.predicador.reporting.dto;

import java.time.Instant;

/**
 * Reporte compacto para la analítica del panel: sin geometrías, que pesan y
 * no hacen falta para contar, medir tiempos ni armar el historial.
 */
public record ReporteAdminDto(
        Integer id,
        Instant fecha,
        Instant inicioSesion,
        Long encargadoId,
        String encargadoNombre,
        String encargadoApellido,
        Long territorio,
        String estado,
        String tipoSesion,
        Integer totalManzanas,
        Integer manzanasMarcadas,
        String manzanasIds,
        boolean tieneParcial
) {}
