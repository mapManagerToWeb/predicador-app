package com.predicador.reporting.service;

import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DestinoWhatsAppTest {

    private static final String CONFIGURADO = "56900000000";

    private EncargadoRepository encargados;
    private DestinoWhatsApp destino;

    private static SessionToken sesion(String sujeto, String rol) {
        return new SessionToken(sujeto, rol, 1L, 2L);
    }

    private void encargadoConTelefono(String telefono) {
        Encargado e = new Encargado();
        e.setId(7L);
        e.setTelefono(telefono);
        when(encargados.findById(7L)).thenReturn(Optional.of(e));
    }

    @BeforeEach
    void setUp() {
        encargados = mock(EncargadoRepository.class);
        WhatsAppProperties props = mock(WhatsAppProperties.class);
        when(props.destinationNumber()).thenReturn(CONFIGURADO);
        destino = new DestinoWhatsApp(encargados, props);
    }

    @Test
    void leLlegaAlEncargadoQueEnvia_aSuTelefonoRegistrado() {
        encargadoConTelefono("+56 9 1234 5678");
        assertThat(destino.para(sesion("7", SessionToken.ROLE_ENCARGADO))).isEqualTo("56912345678");
        encargadoConTelefono("912345678");
        assertThat(destino.para(sesion("7", SessionToken.ROLE_ENCARGADO))).isEqualTo("56912345678");
    }

    @Test
    void sinCelularValido_oSinEncargado_vaAlNumeroConfigurado() {
        encargadoConTelefono("9123456789");
        assertThat(destino.para(sesion("7", SessionToken.ROLE_ENCARGADO))).isEqualTo(CONFIGURADO);
        assertThat(destino.para(sesion("99", SessionToken.ROLE_ENCARGADO))).isEqualTo(CONFIGURADO);
        assertThat(destino.para(sesion("admin", SessionToken.ROLE_ADMIN))).isEqualTo(CONFIGURADO);
        assertThat(destino.para(null)).isEqualTo(CONFIGURADO);
    }

    @Test
    void loQueRegistraElAdministradorLeLlegaAlNumeroQueConfiguroEnElPanel() {
        ConfiguracionService configuracion = mock(ConfiguracionService.class);
        WhatsAppProperties props = mock(WhatsAppProperties.class);
        when(props.destinationNumber()).thenReturn(CONFIGURADO);
        DestinoWhatsApp conPanel = new DestinoWhatsApp(encargados, props, configuracion);
        SessionToken admin = sesion("admin", SessionToken.ROLE_ADMIN);

        when(configuracion.whatsappAdministrador()).thenReturn("+56 9 8765 4321");
        assertThat(conPanel.para(admin)).isEqualTo("56987654321");

        // Sin número en el panel (o uno inválido): el del servidor.
        when(configuracion.whatsappAdministrador()).thenReturn(null);
        assertThat(conPanel.para(admin)).isEqualTo(CONFIGURADO);
        when(configuracion.whatsappAdministrador()).thenReturn("123");
        assertThat(conPanel.para(admin)).isEqualTo(CONFIGURADO);
    }

    @Test
    void copia_soloParaLoQueEnvianLosHermanos_alNumeroElegido_sinRepetirNiDuranteCapacitacion() {
        ConfiguracionService configuracion = mock(ConfiguracionService.class);
        WhatsAppProperties props = mock(WhatsAppProperties.class);
        DestinoWhatsApp conPanel = new DestinoWhatsApp(encargados, props, configuracion);
        SessionToken hermano = sesion("7", SessionToken.ROLE_ENCARGADO);
        when(configuracion.capacitacion()).thenReturn(Optional.empty());

        when(configuracion.whatsappCopia()).thenReturn("+56 9 8765 4321");
        assertThat(conPanel.copiaPara(hermano, "56912345678")).isEqualTo("56987654321");
        // Ni al mismo número del hermano, ni para lo del administrador, ni sin sesión.
        assertThat(conPanel.copiaPara(hermano, "987654321")).isNull();
        assertThat(conPanel.copiaPara(sesion("admin", SessionToken.ROLE_ADMIN), "56912345678")).isNull();
        assertThat(conPanel.copiaPara(null, "56912345678")).isNull();

        // Durante una capacitación son pruebas: sin copia.
        when(configuracion.capacitacion()).thenReturn(Optional.of(
                new ConfiguracionService.Capacitacion(java.time.Instant.parse("2026-11-22T19:00:00Z"), 10L)));
        assertThat(conPanel.copiaPara(hermano, "56912345678")).isNull();

        // Sin número (o uno inválido): sin copia.
        when(configuracion.capacitacion()).thenReturn(Optional.empty());
        when(configuracion.whatsappCopia()).thenReturn(null);
        assertThat(conPanel.copiaPara(hermano, "56912345678")).isNull();
        when(configuracion.whatsappCopia()).thenReturn("123");
        assertThat(conPanel.copiaPara(hermano, "56912345678")).isNull();
        // Sin configuración (construido sin ella): nunca hay copia.
        assertThat(destino.copiaPara(hermano, "56912345678")).isNull();
    }
}
