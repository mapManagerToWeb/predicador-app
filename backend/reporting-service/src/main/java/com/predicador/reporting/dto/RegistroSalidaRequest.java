package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Salida que el administrador registra en nombre de un hermano (lo que le
 * informaron, p. ej. por WhatsApp). Lleva lo que se predicó en esa salida:
 * manzanas enteras y calles, con el mismo formato que envía la app.
 *
 * @param encargadoId      encargado de la lista; si es null, se usa el nombre escrito
 *                         (y se enlaza con un encargado que se llame igual, si existe)
 * @param fechaPredicacion día en que se predicó (cualquier día que no sea futuro)
 */
public record RegistroSalidaRequest(
        @NotNull @PositiveOrZero Long territorio,
        Long encargadoId,
        @Size(max = 100) String encargadoNombre,
        @Size(max = 100) String encargadoApellido,
        @NotNull LocalDate fechaPredicacion,
        String turno,
        String manzanasIds,
        String geometriaParcial,
        String puntosParciales,
        @PositiveOrZero Integer totalManzanas,
        @Size(max = 500) String nota
) {}
