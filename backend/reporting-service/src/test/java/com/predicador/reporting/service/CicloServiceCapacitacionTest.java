package com.predicador.reporting.service;

import com.predicador.reporting.repository.ReportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/** Durante una capacitación la vuelta no se cierra ni cambia de inicio (no se podría deshacer). */
class CicloServiceCapacitacionTest {

    private final JdbcClient jdbc = mock(JdbcClient.class);
    private final CapacitacionService capacitacion = mock(CapacitacionService.class);
    private final CicloService service = new CicloService(jdbc, mock(ReportRepository.class), capacitacion);

    @Test
    void conCapacitacionEnCurso_noSeCierraNiSeCambiaElInicio() {
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "capacitación")).when(capacitacion).exigirSinCapacitacion();
        assertThrows(ResponseStatusException.class, () -> service.cerrar("Campaña", LocalDate.parse("2026-11-01")));
        assertThrows(ResponseStatusException.class, () -> service.cambiarInicio(LocalDate.parse("2026-11-01")));
        verifyNoInteractions(jdbc);
    }
}
