package com.predicador.reporting.dto;

import java.time.Instant;

public record ReportDto(
        Integer id,
        Integer manzanaId,
        Instant fecha,
        String encargadoNombre,
        String encargadoApellido,
        String sessionTime,
        String estado,
        Long territorioNumero
) {}
