package com.predicador.reporting.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DiaDePredicacionTest {

    /** Martes 13-10-2026 a las 22:30 en Chile (ya es miércoles 14 en UTC). */
    private static final Instant AHORA = Instant.parse("2026-10-14T01:30:00Z");
    private static final LocalDate HOY = LocalDate.of(2026, 10, 13);

    @Test
    void hoyEsElDiaDeChile_noElDelServidor() {
        assertThat(DiaDePredicacion.hoy(AHORA)).isEqualTo(HOY);
        assertThat(DiaDePredicacion.delEncargado(null, AHORA)).isEqualTo(HOY);
    }

    @Test
    void elEncargadoPuedeInformarHastaSieteDiasAtras() {
        assertThat(DiaDePredicacion.delEncargado(HOY.minusDays(1), AHORA)).isEqualTo(HOY.minusDays(1));
        assertThat(DiaDePredicacion.delEncargado(HOY.minusDays(7), AHORA)).isEqualTo(HOY.minusDays(7));
        assertThatThrownBy(() -> DiaDePredicacion.delEncargado(HOY.minusDays(8), AHORA))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("7 días");
    }

    @Test
    void nuncaUnDiaFuturo() {
        // Un día de margen por el reloj del teléfono: se guarda como hoy.
        assertThat(DiaDePredicacion.delEncargado(HOY.plusDays(1), AHORA)).isEqualTo(HOY);
        assertThatThrownBy(() -> DiaDePredicacion.delEncargado(HOY.plusDays(2), AHORA))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> DiaDePredicacion.delAdministrador(HOY.plusDays(1), AHORA))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(DiaDePredicacion.delAdministrador(HOY.minusDays(60), AHORA)).isEqualTo(HOY.minusDays(60));
    }

    @Test
    void elTurnoEsMananaOTarde() {
        assertThat(DiaDePredicacion.turno("Mañana ")).isEqualTo("mañana");
        assertThat(DiaDePredicacion.turno("tarde")).isEqualTo("tarde");
        assertThat(DiaDePredicacion.turno("noche")).isNull();
        assertThat(DiaDePredicacion.turno(null)).isNull();
    }
}
