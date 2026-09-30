package com.predicador.reporting.dto;

import jakarta.validation.constraints.Size;

/**
 * Corrección del reporte de una salida (ADR 0014): cómo tendría que haber
 * quedado el territorio después de esa salida, o anularla entera.
 *
 * @param anular      true: la salida no cuenta (no se guarda un reemplazo)
 * @param manzanasIds manzanas enteras después de la salida, separadas por coma
 * @param nota        motivo (queda en el historial)
 */
public record CorreccionSalidaRequest(
        boolean anular,
        String manzanasIds,
        String geometriaParcial,
        String puntosParciales,
        @Size(max = 500) String nota
) {}
