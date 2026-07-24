package com.predicador.reporting.dto;

import java.time.Instant;

public record ReportDto(
        Integer id,
        String manzanaId,
        Instant fecha,
        String encargadoNombre,
        String encargadoApellido,
        String sessionTime,
        String estado,
        Long territorioNumero,
        Long encargadoId,
        Integer totalManzanas,
        Integer manzanasMarcadas,
        String tipoSesion,
        String geometriaParcial,
        String puntosParciales,
        String manzanasIds
) {
    public ReportDto(Integer id, String manzanaId, Instant fecha, String encargadoNombre,
                     String encargadoApellido, String sessionTime, String estado, Long territorioNumero) {
        this(id, manzanaId, fecha, encargadoNombre, encargadoApellido, sessionTime, estado, territorioNumero,
                null, null, null, null, null, null, null);
    }
}
