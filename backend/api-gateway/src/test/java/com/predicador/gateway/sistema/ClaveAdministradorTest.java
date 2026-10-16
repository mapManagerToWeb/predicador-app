package com.predicador.gateway.sistema;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCrypt;

import static org.assertj.core.api.Assertions.assertThat;

class ClaveAdministradorTest {

    @Test
    void conHashBcryptSoloSirveLaContrasenaCorrecta() {
        ClaveAdministrador clave = new ClaveAdministrador("", BCrypt.hashpw("Secreta#2026", BCrypt.gensalt(4)), true);

        assertThat(clave.coincide("Secreta#2026")).isTrue();
        assertThat(clave.coincide("secreta#2026")).isFalse();
        assertThat(clave.coincide("")).isFalse();
        assertThat(clave.coincide(null)).isFalse();
    }

    @Test
    void laContrasenaEnTextoPlanoSoloSirveFueraDelModoEstricto() {
        assertThat(new ClaveAdministrador("local", "", false).coincide("local")).isTrue();
        assertThat(new ClaveAdministrador("local", "", false).coincide("locales")).isFalse();
        assertThat(new ClaveAdministrador("local", "", true).coincide("local")).isFalse();
    }

    @Test
    void unHashMalConfiguradoRechazaEnVezDeDejarPasar() {
        assertThat(new ClaveAdministrador("", "no-es-un-hash", true).coincide("cualquiera")).isFalse();
    }
}
