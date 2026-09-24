package com.predicador.territory.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Mueve varias manzanas a otro territorio (existente o nuevo). */
public record ReasignarManzanasRequest(
        @NotEmpty(message = "ids es obligatorio")
        @Size(max = 1000, message = "demasiadas manzanas")
        List<Long> ids,
        @NotNull(message = "territorio es obligatorio")
        @PositiveOrZero(message = "territorio debe ser >= 0")
        Long territorio
) {}
