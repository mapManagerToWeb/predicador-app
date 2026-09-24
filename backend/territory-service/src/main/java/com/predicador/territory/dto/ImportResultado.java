package com.predicador.territory.dto;

import java.util.List;

/** Resultado de importar un FeatureCollection de manzanas. */
public record ImportResultado(int creadas, List<Long> territorios) {}
