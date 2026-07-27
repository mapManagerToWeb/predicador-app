package com.predicador.reporting.dto;

public record EncargadoDto(
        Long id,
        String nombre,
        String apellido,
        Integer avatar,
        String telefono,
        Boolean activo
) {}
