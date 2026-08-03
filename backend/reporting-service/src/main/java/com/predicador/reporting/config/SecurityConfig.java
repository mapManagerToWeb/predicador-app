package com.predicador.reporting.config;

import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionAuthFilter.Rule;
import com.predicador.shared.security.SessionTokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.annotation.Nullable;
import java.util.List;

/**
 * Wires {@link SessionAuthFilter} for reporting-service.
 *
 * <p>Rules encode which endpoints require an authenticated session token.
 * Login/registration endpoints (which <em>mint</em> tokens) are intentionally
 * excluded so a fresh client can still authenticate. GETs on encargados stay
 * behind auth because the list exposes phone numbers.</p>
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    /**
     * Matches any authenticated principal (encargado or admin). Fine-grained
     * owner/admin authorization is enforced by the reporting services after
     * the filter attaches the validated token.
     */
    private static final String ROLE_ANY = null;

    @Bean
    public FilterRegistrationBean<SessionAuthFilter> sessionAuthFilter(SessionTokenService tokens) {
        if (!tokens.isConfigured()) {
            log.warn("SESSION_SECRET no configurado: SessionAuthFilter arranca en modo compatibilidad "
                    + "(no aplica enforcement). Configurar app.session.secret en producción.");
        }

        List<Rule> rules = List.of(
                // Reports: todo excepto rutas internas quedan protegidas.
                Rule.any(List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null),

                // Encargados: mutaciones y consultas requieren sesión.
                // Excluye:
                //   POST /encargados/login          (emite token)
                //   POST /encargados/buscar-crear   (emite token; también registra)
                //   POST /encargados                (registro directo)
                //   POST /encargados/{id}? via PUT abajo
                Rule.of("PUT", "^/api/v1/encargados/[0-9]+$", null),
                Rule.of("GET", "^/api/v1/encargados/?$", null),
                Rule.of("GET", "^/api/v1/encargados/buscar$", null),
                Rule.of("GET", "^/api/v1/encargados/session$", null)
        );

        FilterRegistrationBean<SessionAuthFilter> reg = new FilterRegistrationBean<>(
                new SessionAuthFilter(tokens, rules));
        reg.setName("sessionAuthFilter");
        reg.setOrder(-100);   // antes de cualquier otro filter de negocio
        reg.addUrlPatterns("/api/v1/*");
        return reg;
    }
}
