package com.predicador.territory.dto;

public record TerritoryDto(
        Long number,
        String name,
        String geoJson,
        String color
) {}
