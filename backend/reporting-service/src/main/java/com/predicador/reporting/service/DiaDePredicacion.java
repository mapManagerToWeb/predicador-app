package com.predicador.reporting.service;

import com.predicador.reporting.model.Report;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Día y turno de la predicación que informa un reporte (ADR 0018). El reporte
 * se ordena por cuándo se envió ({@code fecha}); esto es solo qué día se
 * predicó, para el S-13, el panel y el WhatsApp.
 */
final class DiaDePredicacion {

    /** La congregación está en Chile: "hoy" es el día de allá, no el del servidor (UTC). */
    static final ZoneId ZONA = ZoneId.of("America/Santiago");
    /** Hasta cuántos días atrás puede informar un encargado desde la app. */
    static final int DIAS_ATRAS = 7;

    private DiaDePredicacion() {}

    static LocalDate hoy(Instant ahora) {
        return ahora.atZone(ZONA).toLocalDate();
    }

    /** El día que eligió el encargado: hoy o hasta {@value #DIAS_ATRAS} días atrás. Sin día (app anterior): hoy. */
    static LocalDate delEncargado(LocalDate dia, Instant ahora) {
        LocalDate hoy = hoy(ahora);
        if (dia == null) return hoy;
        // Un día de margen hacia adelante: el reloj o la zona del teléfono pueden diferir.
        if (dia.isAfter(hoy.plusDays(1))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El día de la predicación no puede ser futuro.");
        }
        if (dia.isBefore(hoy.minusDays(DIAS_ATRAS))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Solo se puede informar hasta " + DIAS_ATRAS + " días atrás. Para una fecha anterior, avisa al administrador.");
        }
        return dia.isAfter(hoy) ? hoy : dia;
    }

    /** El administrador puede poner cualquier día que no sea futuro. */
    static LocalDate delAdministrador(LocalDate dia, Instant ahora) {
        if (dia != null && dia.isAfter(hoy(ahora))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El día de la predicación no puede ser futuro.");
        }
        return dia;
    }

    /** "mañana" o "tarde"; cualquier otra cosa, sin turno. */
    static String turno(String turno) {
        if (turno == null) return null;
        String t = turno.strip().toLowerCase();
        if (t.equals(Report.TURNO_MANANA) || t.equals("manana")) return Report.TURNO_MANANA;
        return t.equals(Report.TURNO_TARDE) ? Report.TURNO_TARDE : null;
    }
}
