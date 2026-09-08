package com.predicador.territory.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record TerritoryDto(
        @NotNull
        @PositiveOrZero
        Long number,
        String name,
        String geoJson,
        String color
) {}
