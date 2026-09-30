package com.predicador.reporting.service;

import com.predicador.reporting.dto.CorreccionSalidaRequest;
import com.predicador.reporting.dto.ResultadoCorreccionSalida;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CorreccionDeSalidasTest {

    @Mock ReportRepository reportes;
    @Mock CatalogoManzanas catalogo;

    private CorreccionDeSalidas servicio;
    private final List<Report> guardados = new ArrayList<>();
    private Report r1;
    private Report r2;
    private Report r3;

    private static Report reporte(int id, String quien, String ids, String estado, int minuto) {
        Report r = new Report();
        r.setId(id);
        r.setTerritorioNumero(5L);
        r.setFecha(Instant.parse("2026-09-20T10:00:00Z").plusSeconds(60L * minuto));
        r.setEncargadoId((long) id);
        r.setEncargadoNombre(quien);
        r.setEncargadoApellido("P");
        r.setManzanasIds(ids);
        r.setEstado(estado);
        r.setTotalManzanas(3);
        r.setOrigen(Report.ORIGEN_SALIDA);
        return r;
    }

    @BeforeEach
    void setUp() {
        servicio = new CorreccionDeSalidas(reportes, catalogo);
        // Ana marcó la 5.a; Luis marcó por error también la 5.c (y el territorio quedó completo);
        // después Ana empezó la vuelta nueva con la 5.a.
        r1 = reporte(1, "Ana", "5-5.a", "incomplete", 0);
        r2 = reporte(2, "Luis", "5-5.a,5-5.b,5-5.c", "completed", 10);
        r3 = reporte(3, "Ana", "5-5.a", "incomplete", 20);
        when(catalogo.manzanas(5L)).thenReturn(Map.of(501L, "5-5.a", 502L, "5-5.b", 503L, "5-5.c"));
        when(reportes.findById(any())).thenAnswer(i -> List.of(r1, r2, r3).stream()
                .filter(r -> r.getId().equals(i.getArgument(0))).findFirst());
        when(reportes.findByTerritorioNumeroAndAnuladoEnIsNullOrderByFechaAscIdAsc(5L))
                .thenAnswer(i -> List.of(r1, r2, r3).stream().filter(r -> r.getAnuladoEn() == null).toList());
        when(reportes.saveAndFlush(any(Report.class))).thenAnswer(i -> {
            Report r = i.getArgument(0);
            if (r.getId() == null) r.setId(100 + guardados.size());
            guardados.add(r);
            return r;
        });
    }

    @Test
    void corregirUnaSalida_laAnulaGuardaElReemplazoYRecalculaLasPosteriores() {
        ResultadoCorreccionSalida res = servicio.corregir(2,
                new CorreccionSalidaRequest(false, "5-5.a,5-5.b", null, null, "La 5.c no la predicó"));

        assertThat(r2.getAnuladoEn()).isNotNull();
        assertThat(r2.getNota()).contains("La 5.c no la predicó");
        Report nuevo = guardados.stream().filter(r -> Integer.valueOf(2).equals(r.getReemplazaA())).findFirst().orElseThrow();
        assertThat(nuevo.getEncargadoNombre()).isEqualTo("Luis");
        assertThat(nuevo.getFecha()).isEqualTo(r2.getFecha());
        assertThat(nuevo.getManzanasIds()).isEqualTo("5-5.a,5-5.b");
        assertThat(nuevo.getEstado()).isEqualTo("incomplete");
        // Ana no empezó una vuelta nueva: su 5.a se suma a lo que había.
        assertThat(r3.getManzanasIds()).isEqualTo("5-5.a,5-5.b");
        assertThat(r3.getEstado()).isEqualTo("incomplete");
        assertThat(res).isEqualTo(new ResultadoCorreccionSalida(2, nuevo.getId(), 1, false));
    }

    @Test
    void anularUnaSalidaEntera_elTerritorioQuedaComoSiNoHubieraExistido() {
        ResultadoCorreccionSalida res = servicio.corregir(2, new CorreccionSalidaRequest(true, null, null, null, null));

        assertThat(r2.getAnuladoEn()).isNotNull();
        assertThat(guardados).noneMatch(r -> r.getReemplazaA() != null);
        assertThat(r3.getManzanasIds()).isEqualTo("5-5.a");
        assertThat(res.reemplazo()).isNull();
        assertThat(res.recalculados()).isEqualTo(1);
    }

    @Test
    void unaCorreccionOCierreDeCicloPosteriorNoSeToca() {
        r3.setOrigen(Report.ORIGEN_CORRECCION);

        ResultadoCorreccionSalida res = servicio.corregir(2, new CorreccionSalidaRequest(true, null, null, null, null));

        assertThat(res.detenido()).isTrue();
        assertThat(res.recalculados()).isZero();
        assertThat(r3.getManzanasIds()).isEqualTo("5-5.a");
    }

    @Test
    void noSeCorrigeDosVecesNiUnaCorreccionDelAdministrador() {
        r2.setAnuladoEn(Instant.now());
        assertThatThrownBy(() -> servicio.corregir(2, new CorreccionSalidaRequest(true, null, null, null, null)))
                .isInstanceOf(ResponseStatusException.class);

        r1.setOrigen(Report.ORIGEN_CORRECCION);
        assertThatThrownBy(() -> servicio.corregir(1, new CorreccionSalidaRequest(true, null, null, null, null)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void elDetalleTraeLoQueHabiaAntesYCuantosReportesVinieronDespues() {
        var d = servicio.detalle(2);

        assertThat(d.anterior().manzanasIds()).isEqualTo("5-5.a");
        assertThat(d.posteriores()).isEqualTo(1);
        assertThat(d.encargado()).isEqualTo("Luis P");
        verify(reportes).findByTerritorioNumeroAndAnuladoEnIsNullOrderByFechaAscIdAsc(5L);
        assertThat(servicio.detalle(1).anterior()).isNull();
        when(reportes.findById(9)).thenReturn(Optional.empty());
    }
}
