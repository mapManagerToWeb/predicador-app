package com.predicador.reporting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.Instant;

/**
 * Preaching report DTO.
 *
 * <p>Bean Validation constraints are applied conservatively so that the
 * bulk-insert endpoint keeps accepting historical payloads while rejecting
 * clearly invalid ones. All optional persistence fields remain nullable.</p>
 */
public record ReportDto(
        Integer id,
        String manzanaId,
        Instant fecha,
        @NotBlank(message = "encargadoNombre es obligatorio")
        String encargadoNombre,
        String encargadoApellido,
        String sessionTime,
        String estado,
        @NotNull(message = "territorioNumero es obligatorio")
        @PositiveOrZero(message = "territorioNumero debe ser >= 0")
        Long territorioNumero,
        Long encargadoId,
        Integer totalManzanas,
        Integer manzanasMarcadas,
        String tipoSesion,
        String geometriaParcial,
        String puntosParciales,
        String manzanasIds,
        /** Primera manzana marcada de la salida; null en clientes anteriores a V6. */
        Instant inicioSesion
) {
    public ReportDto(Integer id, String manzanaId, Instant fecha, String encargadoNombre,
                     String encargadoApellido, String sessionTime, String estado, Long territorioNumero,
                     Long encargadoId, Integer totalManzanas, Integer manzanasMarcadas, String tipoSesion,
                     String geometriaParcial, String puntosParciales, String manzanasIds) {
        this(id, manzanaId, fecha, encargadoNombre, encargadoApellido, sessionTime, estado, territorioNumero,
                encargadoId, totalManzanas, manzanasMarcadas, tipoSesion, geometriaParcial, puntosParciales,
                manzanasIds, null);
    }

    public ReportDto(Integer id, String manzanaId, Instant fecha, String encargadoNombre,
                     String encargadoApellido, String sessionTime, String estado, Long territorioNumero) {
        this(id, manzanaId, fecha, encargadoNombre, encargadoApellido, sessionTime, estado, territorioNumero,
                null, null, null, null, null, null, null, null);
    }
}
