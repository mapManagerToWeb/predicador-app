package com.predicador.reporting.service;

import com.predicador.reporting.dto.RegistroSalidaRequest;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RegistroDeSalidasTest {

    private static final LocalDate SABADO = LocalDate.parse("2026-11-07");

    private ReportService reportes;
    private EncargadoRepository encargados;
    private RegistroDeSalidas registro;

    @BeforeEach
    void setUp() {
        reportes = mock(ReportService.class);
        encargados = mock(EncargadoRepository.class);
        registro = new RegistroDeSalidas(reportes, encargados);
        when(reportes.registrarDelAdministrador(any(), anyString())).thenAnswer(i -> i.getArgument(0));
        when(encargados.findByNaturalIdentity(anyString(), anyString())).thenReturn(Optional.empty());
    }

    private static RegistroSalidaRequest pedido(Long id, String nombre, String apellido, String manzanas, String calles) {
        return new RegistroSalidaRequest(72L, id, nombre, apellido, SABADO, "mañana", manzanas, null, calles, 4, null);
    }

    private ReportDto registrado(String nota) {
        ArgumentCaptor<ReportDto> dto = ArgumentCaptor.forClass(ReportDto.class);
        verify(reportes).registrarDelAdministrador(dto.capture(), eq(nota));
        return dto.getValue();
    }

    @Test
    void unHermanoSinCuentaQuedaConSuNombre_sinCrearleCuenta() {
        registro.registrar(pedido(null, "  Pedro ", " Soto  Díaz ", "72-72.a", null));

        ReportDto dto = registrado(RegistroDeSalidas.MARCA);
        assertThat(dto.encargadoNombre()).isEqualTo("Pedro");
        assertThat(dto.encargadoApellido()).isEqualTo("Soto Díaz");
        assertThat(dto.encargadoId()).isNull();
        assertThat(dto.fechaPredicacion()).isEqualTo(SABADO);
        assertThat(dto.turno()).isEqualTo("mañana");
        assertThat(dto.manzanasIds()).isEqualTo("72-72.a");
        verify(encargados, never()).save(any(Encargado.class));
    }

    @Test
    void siSeLlamaIgualQueUnEncargadoQuedaEnlazadoAEl() {
        Encargado ana = new Encargado();
        ana.setId(7L);
        when(encargados.findByNaturalIdentity("Ana", "Pérez")).thenReturn(Optional.of(ana));

        registro.registrar(pedido(null, "Ana", "Pérez", null, "{\"v\":2,\"zonas\":[]}"));

        assertThat(registrado(RegistroDeSalidas.MARCA).encargadoId()).isEqualTo(7L);
    }

    @Test
    void elegidoDeLaListaUsaSuNombreGuardado() {
        Encargado luis = new Encargado();
        luis.setId(9L);
        luis.setNombre("Luis");
        luis.setApellido("Rojas");
        when(encargados.findById(9L)).thenReturn(Optional.of(luis));

        registro.registrar(new RegistroSalidaRequest(72L, 9L, "otro", "nombre", SABADO, null, "72-72.a", null, null,
                4, "Por WhatsApp del sábado"));

        ReportDto dto = registrado(RegistroDeSalidas.MARCA + ": Por WhatsApp del sábado");
        assertThat(dto.encargadoNombre()).isEqualTo("Luis");
        assertThat(dto.encargadoApellido()).isEqualTo("Rojas");
        assertThat(dto.encargadoId()).isEqualTo(9L);
    }

    @Test
    void unEncargadoQueNoExisteEs404() {
        when(encargados.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> registro.registrar(pedido(99L, null, null, "72-72.a", null)))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void sinNombreOSinNadaMarcadoNoSeGuarda() {
        assertThatThrownBy(() -> registro.registrar(pedido(null, " ", "Soto", "72-72.a", null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("nombre");
        assertThatThrownBy(() -> registro.registrar(pedido(null, "Pedro", "Soto", " ", null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Marca al menos");
        verify(reportes, never()).registrarDelAdministrador(any(), anyString());
    }
}
