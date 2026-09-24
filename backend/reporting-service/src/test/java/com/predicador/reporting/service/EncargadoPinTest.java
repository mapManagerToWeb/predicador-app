package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoAdminRequest;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.reporting.repository.ReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Login con PIN, bloqueo y reglas de auto-registro de encargados. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EncargadoPinTest {

    @Mock private EncargadoRepository repository;
    @Mock private ReportRepository reportes;
    @Mock private ConfiguracionService configuracion;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private EncargadoService service;
    private EncargadoAdminService admin;
    private Encargado ana;

    @BeforeEach
    void setUp() {
        service = new EncargadoService(repository, new AuthorizationService(), configuracion, encoder);
        admin = new EncargadoAdminService(repository, reportes, encoder);
        ana = new Encargado();
        ana.setId(7L);
        ana.setNombre("Ana");
        ana.setApellido("Pérez");
        ana.setTelefono("56911111111");
        ana.setActivo(true);
        when(repository.findByTelefono("56911111111")).thenReturn(Optional.of(ana));
        when(repository.findById(7L)).thenReturn(Optional.of(ana));
        when(repository.save(any(Encargado.class))).thenAnswer(i -> i.getArgument(0));
        when(configuracion.registroAbierto()).thenReturn(true);
    }

    @Test
    void sinPin_entraSoloConTelefono_yRegistraUltimoAcceso() {
        assertThat(service.autenticar("56911111111", null).id()).isEqualTo(7L);
        assertThat(ana.getUltimoAcceso()).isNotNull();
    }

    @Test
    void conPin_loExige_yLoValida() {
        String pin = admin.generarPin(7L);
        assertThat(pin).matches("\\d{6}");
        assertThat(ana.getPinHash()).isNotEqualTo(pin);

        assertThatThrownBy(() -> service.autenticar("56911111111", null))
                .isInstanceOfSatisfying(EncargadoLoginException.class, e -> {
                    assertThat(e.getCode()).isEqualTo(EncargadoLoginException.PIN_REQUERIDO);
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
                });
        assertThatThrownBy(() -> service.autenticar("56911111111", otroPin(pin)))
                .isInstanceOfSatisfying(EncargadoLoginException.class,
                        e -> assertThat(e.getCode()).isEqualTo(EncargadoLoginException.PIN_INCORRECTO));
        assertThat(ana.getPinIntentosFallidos()).isEqualTo(1);

        assertThat(service.autenticar("56911111111", pin).id()).isEqualTo(7L);
        assertThat(ana.getPinIntentosFallidos()).isZero();
    }

    @Test
    void cincoPinIncorrectos_bloquean_inclusoConElPinCorrecto() {
        String pin = admin.generarPin(7L);
        for (int i = 0; i < EncargadoService.MAX_INTENTOS_PIN; i++) {
            assertThatThrownBy(() -> service.autenticar("56911111111", otroPin(pin)))
                    .isInstanceOf(EncargadoLoginException.class);
        }
        assertThat(ana.getPinBloqueadoHasta()).isAfter(Instant.now());

        assertThatThrownBy(() -> service.autenticar("56911111111", pin))
                .isInstanceOfSatisfying(EncargadoLoginException.class, e -> {
                    assertThat(e.getCode()).isEqualTo(EncargadoLoginException.PIN_BLOQUEADO);
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.LOCKED);
                });

        admin.desbloquear(7L);
        assertThat(service.autenticar("56911111111", pin).id()).isEqualTo(7L);
    }

    @Test
    void inactivo_noEntra() {
        ana.setActivo(false);
        assertThatThrownBy(() -> service.autenticar("56911111111", null))
                .isInstanceOfSatisfying(EncargadoLoginException.class,
                        e -> assertThat(e.getCode()).isEqualTo(EncargadoLoginException.INACTIVO));
    }

    @Test
    void telefonoDesconocido_esNoEncontrado() {
        when(repository.findByActivoTrueOrderByNombreAsc()).thenReturn(List.of());
        assertThatThrownBy(() -> service.autenticar("56999999999", null))
                .isInstanceOfSatisfying(EncargadoLoginException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void buscarOCrear_noPermiteEntrarPorNombreAUnEncargadoConPin_niCambiarleElTelefono() {
        admin.generarPin(7L);
        when(repository.findByNaturalIdentity("Ana", "Pérez")).thenReturn(Optional.of(ana));

        assertThatThrownBy(() -> service.buscarOCrear("Ana", "Pérez", "56900000000"))
                .isInstanceOfSatisfying(EncargadoLoginException.class,
                        e -> assertThat(e.getCode()).isEqualTo(EncargadoLoginException.YA_REGISTRADO));
        assertThat(ana.getTelefono()).isEqualTo("56911111111");
    }

    @Test
    void registroCerrado_bloqueaAutoRegistro() {
        when(configuracion.registroAbierto()).thenReturn(false);

        assertThatThrownBy(() -> service.buscarOCrear("Nuevo", "Encargado", null))
                .isInstanceOfSatisfying(EncargadoLoginException.class,
                        e -> assertThat(e.getCode()).isEqualTo(EncargadoLoginException.REGISTRO_CERRADO));
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void admin_noPermiteTelefonoRepetido_aunqueEsteEnOtroFormato() {
        Encargado otro = new Encargado();
        otro.setId(8L);
        otro.setNombre("Luis");
        otro.setApellido("Soto");
        otro.setTelefono("911111111"); // mismo número que Ana, sin prefijo 56
        when(repository.findAll()).thenReturn(List.of(ana, otro));
        when(repository.findByNaturalIdentity(anyString(), anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> admin.crear(new EncargadoAdminRequest("Eva", "Rojas", "+56 9 1111 1111", 1, true)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
    }

    @Test
    void admin_noBorraEncargadosConReportes() {
        when(reportes.countByEncargadoId(7L)).thenReturn(3L);
        assertThatThrownBy(() -> admin.eliminar(7L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getReason()).contains("3 reporte"));
        verify(repository, never()).delete(any());
    }

    @Test
    void admin_fusionar_pasaReportesAlDestino_yHeredaTelefono() {
        Encargado duplicado = new Encargado();
        duplicado.setId(9L);
        duplicado.setNombre("ana");
        duplicado.setApellido("perez");
        duplicado.setTelefono("56922222222");
        ana.setTelefono(null);
        when(repository.findById(9L)).thenReturn(Optional.of(duplicado));
        when(repository.saveAndFlush(any(Encargado.class))).thenAnswer(i -> i.getArgument(0));

        var resultado = admin.fusionar(9L, 7L);

        verify(reportes).reasignarEncargado(9L, 7L, "Ana", "Pérez");
        verify(repository).delete(duplicado);
        assertThat(resultado.telefono()).isEqualTo("56922222222");
        assertThatThrownBy(() -> admin.fusionar(7L, 7L)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void claveTelefono_ignoraFormatoYPrefijo() {
        assertThat(EncargadoAdminService.claveTelefono("+56 9 1234 5678")).isEqualTo("912345678");
        assertThat(EncargadoAdminService.claveTelefono("912345678")).isEqualTo("912345678");
    }

    private static String otroPin(String pin) {
        return pin.equals("000000") ? "000001" : "000000";
    }
}
