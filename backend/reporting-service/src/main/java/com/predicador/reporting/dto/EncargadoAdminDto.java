package com.predicador.reporting.dto;

import java.time.Instant;

/** Encargado tal como lo ve el panel de administración (incluye estado de credenciales y actividad). */
public record EncargadoAdminDto(
        Long id,
        String nombre,
        String apellido,
        String telefono,
        Integer avatar,
        boolean activo,
        boolean tienePin,
        Instant pinActualizadoEn,
        Instant bloqueadoHasta,
        Instant ultimoAcceso,
        Instant creadoEn,
        long totalReportes,
        Instant ultimoReporte
) {}
