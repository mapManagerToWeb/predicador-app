package com.predicador.reporting.dto;

import java.time.Instant;

/**
 * El reporte de una salida con lo que había antes en el territorio, para
 * corregirlo en el panel (ADR 0014).
 *
 * @param anterior    estado del territorio antes de la salida (null: no había reportes)
 * @param posteriores reportes vigentes del territorio posteriores a este
 */
public record SalidaAdminDto(
        Integer id,
        Instant fecha,
        String encargado,
        long territorio,
        String origen,
        String estado,
        String manzanasIds,
        String geometriaParcial,
        String puntosParciales,
        Integer totalManzanas,
        Instant anuladoEn,
        EstadoPrevio anterior,
        int posteriores
) {
    /** Lo que había en el territorio antes de la salida (vacío si empezó una vuelta nueva). */
    public record EstadoPrevio(String estado, String manzanasIds, String geometriaParcial, String puntosParciales) {}
}
