package com.predicador.reporting.dto;

import java.time.Instant;

public record EncargadoDto(
        Long id,
        String nombre,
        String apellido,
        Integer avatar,
        Boolean activo
) {}
