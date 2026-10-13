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
        boolean tieneParcial,
        /** salida (encargado), correccion o reinicio (administrador). */
        String origen,
        String nota,
        /** El administrador lo anuló (ADR 0014): se muestra en el historial pero no cuenta. */
        Instant anuladoEn,
        /** Id del reporte que este corrige. */
        Integer reemplazaA,
        /** Día de la predicación (ADR 0018); null en reportes anteriores: se usa el día de {@code fecha}. */
        java.time.LocalDate fechaPredicacion,
        /** "mañana" o "tarde"; null en reportes anteriores. */
        String turno
) {}
