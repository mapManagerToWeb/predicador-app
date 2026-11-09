package com.predicador.reporting.dto;

import jakarta.validation.constraints.Size;

/**
 * Cierre del ciclo en curso; la nota queda guardada con el informe.
 *
 * @param desde día en que empieza la vuelta nueva (p. ej. el inicio de una
 *              campaña); null = hoy, en el momento de cerrar
 */
public record CerrarCicloRequest(@Size(max = 500) String nota, java.time.LocalDate desde) {
    public CerrarCicloRequest(String nota) {
        this(nota, null);
    }
}
