package com.predicador.reporting.service;

import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.util.PhoneUtil;
import org.springframework.stereotype.Component;

/**
 * A quién le llega el WhatsApp de un reporte: al encargado que tiene la
 * sesión, a su teléfono registrado (el bot no puede estar en el grupo de
 * predicación, así que el reporte le llega al hermano que lo envía).
 *
 * <p>El número sale de la cuenta en la base, según la sesión; nunca de lo que
 * manda la app ({@code destinationNumber} se ignora, ADR 0016): así nadie
 * puede usar la cuenta de Meta de la congregación para escribir a otro número.
 * Con sesión de administrador (registros desde el panel) va al número que el
 * administrador configuró en el panel; sin él, o sin un celular válido, al
 * número del servidor ({@code WHATSAPP_DESTINATION}).</p>
 */
@Component
public class DestinoWhatsApp {

    private final EncargadoRepository encargados;
    private final WhatsAppProperties props;
    private final ConfiguracionService configuracion;

    public DestinoWhatsApp(EncargadoRepository encargados, WhatsAppProperties props) {
        this(encargados, props, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DestinoWhatsApp(EncargadoRepository encargados, WhatsAppProperties props, ConfiguracionService configuracion) {
        this.encargados = encargados;
        this.props = props;
        this.configuracion = configuracion;
    }

    public String para(SessionToken token) {
        if (token != null && token.hasRole(SessionToken.ROLE_ENCARGADO)) {
            try {
                String telefono = encargados.findById(Long.valueOf(token.subject()))
                        .map(e -> e.getTelefono())
                        .orElse(null);
                if (PhoneUtil.esCelularChileno(telefono)) return PhoneUtil.normalize(telefono);
            } catch (NumberFormatException sinId) {
                // Sesión sin id de encargado: va al número configurado.
            }
        }
        if (token != null && token.hasRole(SessionToken.ROLE_ADMIN) && configuracion != null) {
            String delAdministrador = configuracion.whatsappAdministrador();
            if (PhoneUtil.esCelularChileno(delAdministrador)) return PhoneUtil.normalize(delAdministrador);
        }
        return props.destinationNumber();
    }

    /**
     * A quién le llega además una copia del reporte: el número que el
     * administrador eligió en el panel. Solo para lo que envían los hermanos
     * desde la app (lo que registra el administrador ya le llega a él), nunca
     * repetido al mismo número que el principal, y no durante una capacitación
     * (serían pruebas). {@code null}: sin copia.
     */
    public String copiaPara(SessionToken token, String principal) {
        if (configuracion == null || token == null || !token.hasRole(SessionToken.ROLE_ENCARGADO)) return null;
        String copia = configuracion.whatsappCopia();
        if (!PhoneUtil.esCelularChileno(copia)) return null;
        String normalizada = PhoneUtil.normalize(copia);
        String principalNormalizado = PhoneUtil.esCelularChileno(principal) ? PhoneUtil.normalize(principal) : principal;
        if (normalizada.equals(principalNormalizado)) return null;
        if (configuracion.capacitacion().isPresent()) return null;
        return normalizada;
    }
}
