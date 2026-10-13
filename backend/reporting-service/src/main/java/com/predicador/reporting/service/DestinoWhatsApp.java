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
 * Sin encargado (sesión de administrador) o sin un celular válido, va al
 * número configurado ({@code WHATSAPP_DESTINATION}).</p>
 */
@Component
public class DestinoWhatsApp {

    private final EncargadoRepository encargados;
    private final WhatsAppProperties props;

    public DestinoWhatsApp(EncargadoRepository encargados, WhatsAppProperties props) {
        this.encargados = encargados;
        this.props = props;
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
        return props.destinationNumber();
    }
}
