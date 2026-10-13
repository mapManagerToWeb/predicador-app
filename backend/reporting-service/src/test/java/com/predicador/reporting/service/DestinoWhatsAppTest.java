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
}
