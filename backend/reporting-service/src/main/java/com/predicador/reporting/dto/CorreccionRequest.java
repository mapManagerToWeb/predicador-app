package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Nuevo estado de un territorio fijado por el administrador (p. ej. después de
 * desmarcar una manzana o una calle marcada por error). Queda como un reporte
 * más, de origen "correccion": no se borra nada.
 *
 * @param manzanasIds      manzanas marcadas enteras, separadas por coma
 * @param manzanasMarcadas enteras + por calles
 */
public record CorreccionRequest(
        @NotNull @PositiveOrZero Long territorio,
        String manzanasIds,
        String geometriaParcial,
        String puntosParciales,
        @NotNull @PositiveOrZero Integer totalManzanas,
        @NotNull @PositiveOrZero Integer manzanasMarcadas,
        @Size(max = 500) String nota
) {}
