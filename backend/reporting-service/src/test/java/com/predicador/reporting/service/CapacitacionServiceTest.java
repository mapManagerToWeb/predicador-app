package com.predicador.reporting.service;

import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.reporting.service.ConfiguracionService.Capacitacion;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CapacitacionServiceTest {

    private final ConfiguracionService configuracion = mock(ConfiguracionService.class);
    private final ReportRepository reportes = mock(ReportRepository.class);
    private final CapacitacionService service = new CapacitacionService(configuracion, reportes);
    private final Capacitacion enCurso = new Capacitacion(Instant.parse("2026-11-22T19:00:00Z"), 120L);

    private static Report prueba(int id, long territorio, String nombre, String apellido) {
        Report r = new Report();
        r.setId(id);
        r.setFecha(Instant.parse("2026-11-22T19:10:00Z"));
        r.setTerritorioNumero(territorio);
        r.setEncargadoNombre(nombre);
        r.setEncargadoApellido(apellido);
        r.setEstado("incomplete");
        r.setOrigen(Report.ORIGEN_SALIDA);
        return r;
    }

    @Test
    void sinCapacitacion_elEstadoEstaApagadoYNoBuscaReportes() {
        when(configuracion.capacitacion()).thenReturn(Optional.empty());
        CapacitacionService.Estado estado = service.estado();
        assertFalse(estado.activa());
        assertNull(estado.desde());
        assertEquals(List.of(), estado.pruebas());
        verify(reportes, never()).findByIdGreaterThanOrderByIdAsc(anyInt());
    }

    @Test
    void empezar_guardaElUltimoReporteQueYaExistia() {
        when(configuracion.capacitacion()).thenReturn(Optional.empty());
        when(reportes.ultimoId()).thenReturn(120L);
        service.empezar();
        verify(configuracion).setCapacitacion(org.mockito.ArgumentMatchers.argThat(c -> c.ultimoReporte() == 120L && c.desde() != null));
    }

    @Test
    void empezarDosVeces_siguePorLaMisma() {
        when(configuracion.capacitacion()).thenReturn(Optional.of(enCurso));
        service.empezar();
        verify(configuracion, never()).setCapacitacion(any());
    }

    @Test
    void enCurso_muestraLasPruebasConElNombreDeQuienLasEnvio() {
        when(configuracion.capacitacion()).thenReturn(Optional.of(enCurso));
        when(reportes.findByIdGreaterThanOrderByIdAsc(120)).thenReturn(List.of(prueba(121, 15, "Juan", "Pérez"), prueba(122, 3, null, null)));
        CapacitacionService.Estado estado = service.estado();
        assertTrue(estado.activa());
        assertEquals(enCurso.desde(), estado.desde());
        assertEquals(2, estado.pruebas().size());
        assertEquals("Juan Pérez", estado.pruebas().get(0).encargado());
        assertEquals(15L, estado.pruebas().get(0).territorio());
        assertNull(estado.pruebas().get(1).encargado());
    }

    @Test
    void terminarBorrando_borraSoloLoPosteriorYApaga() {
        when(configuracion.capacitacion()).thenReturn(Optional.of(enCurso));
        when(reportes.borrarDespuesDe(120)).thenReturn(37);
        assertEquals(37, service.terminar(true));
        verify(reportes).borrarDespuesDe(120);
        verify(configuracion).setCapacitacion(null);
    }

    @Test
    void terminarSinBorrar_dejaLosReportes() {
        when(configuracion.capacitacion()).thenReturn(Optional.of(enCurso));
        assertEquals(0, service.terminar(false));
        verify(reportes, never()).borrarDespuesDe(anyInt());
        verify(configuracion).setCapacitacion(null);
    }

    @Test
    void terminarSinCapacitacion_esUnError() {
        when(configuracion.capacitacion()).thenReturn(Optional.empty());
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.terminar(true));
        assertEquals(409, e.getStatusCode().value());
        verify(reportes, never()).borrarDespuesDe(anyInt());
    }

    @Test
    void duranteLaCapacitacion_seProtegeLaHistoriaAnterior() {
        when(configuracion.capacitacion()).thenReturn(Optional.of(enCurso));
        assertEquals(409, assertThrows(ResponseStatusException.class, service::exigirSinCapacitacion).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.exigirQueSeaPrueba(120)).getStatusCode().value());
        assertDoesNotThrow(() -> service.exigirQueSeaPrueba(121));
    }

    @Test
    void sinCapacitacion_todoSePermite() {
        when(configuracion.capacitacion()).thenReturn(Optional.empty());
        assertDoesNotThrow(service::exigirSinCapacitacion);
        assertDoesNotThrow(() -> service.exigirQueSeaPrueba(1));
    }
}
