package com.predicador.reporting.service;

import com.predicador.reporting.dto.ImportacionEncargados.Fila;
import com.predicador.reporting.dto.ImportacionEncargados.Resultado;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.reporting.repository.ReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Cargar una lista de hermanos desde el panel. */
class ImportarEncargadosTest {

    private EncargadoRepository encargados;
    private EncargadoAdminService admin;

    @BeforeEach
    void setUp() {
        encargados = mock(EncargadoRepository.class);
        admin = new EncargadoAdminService(encargados, mock(ReportRepository.class), new BCryptPasswordEncoder(4));
        Encargado ana = new Encargado();
        ana.setId(7L);
        ana.setNombre("Ana");
        ana.setApellido("Pérez");
        ana.setTelefono("56911111111");
        when(encargados.findAll()).thenReturn(List.of(ana));
    }

    private static Fila fila(String nombre, String apellido, String telefono) {
        return new Fila(nombre, apellido, telefono);
    }

    @Test
    void revisaCadaFila_sinGuardarNadaAlSimular() {
        List<Resultado> r = admin.importar(List.of(
                fila("Pedro", "Soto", "9 2222 3333"),
                fila("ana", "perez", "+56 9 1111 1111"),
                fila("Luis", "Rojas", "12345"),
                fila("María", "", "922223334"),
                fila("Juan", "Díaz", "922223333"),
                fila("Pedro", " Soto ", "933334444"),
                fila("Ana", "Pérez", "944445555"),
                fila("Carla", "Mora", "911111111")), true);

        assertThat(r).extracting(Resultado::resultado)
                .containsExactly("crear", "existe", "error", "error", "error", "error", "error", "error");
        assertThat(r.get(0).telefono()).isEqualTo("56922223333");
        assertThat(r.get(2).detalle()).contains("9 dígitos");
        assertThat(r.get(3).detalle()).contains("apellido");
        assertThat(r.get(4).detalle()).contains("repetido en la lista (fila 1)");
        assertThat(r.get(5).detalle()).contains("Nombre repetido en la lista (fila 1)");
        assertThat(r.get(6).detalle()).contains("Nombre repetido en la lista (fila 2)");
        assertThat(r.get(7).detalle()).contains("Teléfono repetido en la lista (fila 2)");
        verify(encargados, never()).save(any());
    }

    @Test
    void mismoNombreQueUnoRegistradoPeroConOtroTelefono_noSeCrea() {
        List<Resultado> r = admin.importar(List.of(fila("Ana", "Pérez", "944445555")), true);

        assertThat(r.get(0).resultado()).isEqualTo("error");
        assertThat(r.get(0).detalle()).contains("Ana Pérez con otro teléfono (56911111111)");
    }

    @Test
    void unTelefonoQueYaUsaOtroHermano_noSeCrea() {
        List<Resultado> r = admin.importar(List.of(fila("Carla", "Mora", "9 1111 1111")), true);

        assertThat(r.get(0).resultado()).isEqualTo("error");
        assertThat(r.get(0).detalle()).contains("ya lo usa Ana Pérez");
    }

    @Test
    void alConfirmarCreaSoloLosQueEstanBien() {
        List<Resultado> r = admin.importar(List.of(
                fila("  Pedro ", "Soto   Díaz", "922223333"),
                fila("Ana", "Pérez", "911111111"),
                fila("Luis", "Rojas", "1")), false);

        assertThat(r).extracting(Resultado::resultado).containsExactly("crear", "existe", "error");
        ArgumentCaptor<Encargado> creado = ArgumentCaptor.forClass(Encargado.class);
        verify(encargados, times(1)).save(creado.capture());
        assertThat(creado.getValue().getNombre()).isEqualTo("Pedro");
        assertThat(creado.getValue().getApellido()).isEqualTo("Soto Díaz");
        assertThat(creado.getValue().getTelefono()).isEqualTo("56922223333");
        assertThat(creado.getValue().getActivo()).isTrue();
    }

    @Test
    void listaVaciaODemasiadoLargaSeRechaza() {
        assertThatThrownBy(() -> admin.importar(List.of(), true)).isInstanceOf(ResponseStatusException.class);
        List<Fila> muchas = IntStream.range(0, EncargadoAdminService.MAXIMO_IMPORTACION + 1)
                .mapToObj(i -> fila("N" + i, "A", "9" + String.format("%08d", i)))
                .toList();
        assertThatThrownBy(() -> admin.importar(muchas, true)).hasMessageContaining("máximo");
    }

    @Test
    void reconoceNombresSinTildesNiMayusculas() {
        assertThat(EncargadoAdminService.claveNombre(" María  José ", "PÉREZ")).isEqualTo("maria jose perez");
    }
}
