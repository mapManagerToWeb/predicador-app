package com.predicador.reporting.dto;

import java.time.Instant;

/**
 * Un ciclo de territorios: desde que se empezó a predicar todo el territorio
 * de la congregación hasta que se cerró para volver a empezar.
 *
 * @param resumen JSON con el estado de cada territorio al cerrarse (null si sigue abierto)
 */
public record CicloDto(Long id, Instant inicio, Instant fin, String nota, String resumen) {}
