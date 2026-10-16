package com.predicador.gateway.sistema;

import com.predicador.shared.security.SessionTokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Comprueba la contraseña del administrador: la del login del panel y la que
 * vuelve a pedir el módulo «Sistema». Una sola implementación para las dos.
 *
 * <ul>
 *   <li>{@code ADMIN_PASSWORD_BCRYPT}: hash BCrypt (producción).</li>
 *   <li>{@code ADMIN_PASSWORD}: texto plano, solo fuera del modo estricto (desarrollo local).</li>
 * </ul>
 */
@Component
public class ClaveAdministrador {

    private final String clave;
    private final String claveBcrypt;
    private final boolean estricto;

    @Autowired
    public ClaveAdministrador(@Value("${app.admin.password:}") String clave,
                              @Value("${app.admin.password-bcrypt:}") String claveBcrypt,
                              SessionTokenService tokens) {
        this(clave, claveBcrypt, tokens.isStrict());
    }

    public ClaveAdministrador(String clave, String claveBcrypt, boolean estricto) {
        this.clave = clave;
        this.claveBcrypt = claveBcrypt;
        this.estricto = estricto;
    }

    public boolean coincide(String intento) {
        if (intento == null) return false;
        if (claveBcrypt != null && !claveBcrypt.isBlank()) {
            try {
                return BCrypt.checkpw(intento, claveBcrypt);
            } catch (IllegalArgumentException hashMalo) {
                // Hash mal configurado: se rechaza en vez de dejar pasar.
                return false;
            }
        }
        if (estricto || clave == null || clave.isBlank()) {
            return false;
        }
        return igualesEnTiempoConstante(clave, intento);
    }

    private static boolean igualesEnTiempoConstante(String a, String b) {
        byte[] ab = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        if (ab.length != bb.length) {
            // Recorre el más corto para igualar el tiempo; el largo distinto
            // ya se filtra por tiempo, aceptable para una contraseña.
            int largo = Math.min(ab.length, bb.length);
            for (int i = 0; i < largo; i++) {
                @SuppressWarnings("unused")
                int ignorado = ab[i] ^ bb[i];
            }
            return false;
        }
        int diferencia = 0;
        for (int i = 0; i < ab.length; i++) diferencia |= ab[i] ^ bb[i];
        return diferencia == 0;
    }
}
