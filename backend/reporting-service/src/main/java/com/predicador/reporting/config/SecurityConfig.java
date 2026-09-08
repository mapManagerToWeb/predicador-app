package com.predicador.reporting.config;

import com.predicador.shared.security.SecurityRules;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionTokenService;
import jakarta.annotation.Generated;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires {@link SessionAuthFilter} for reporting-service.
 *
 * <p>Rules encode which endpoints require an authenticated session token.
 * Login/registration endpoints (which <em>mint</em> tokens) are intentionally
 * excluded so a fresh client can still authenticate. GETs on encargados stay
 * behind auth because the list exposes phone numbers.</p>
 */
@Generated("com.predicador.reporting.config.SecurityConfig")
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    public FilterRegistrationBean<SessionAuthFilter> sessionAuthFilter(SessionTokenService tokens) {
        if (!tokens.isConfigured()) {
            log.warn("SESSION_SECRET no configurado: SessionAuthFilter arranca en modo compatibilidad "
                    + "(no aplica enforcement). Configurar app.session.secret en producción.");
        }

        FilterRegistrationBean<SessionAuthFilter> reg = new FilterRegistrationBean<>(
                new SessionAuthFilter(tokens, SecurityRules.REPORTING));
        reg.setName("sessionAuthFilter");
        reg.setOrder(-100);   // antes de cualquier otro filter de negocio
        reg.addUrlPatterns("/api/v1/*");
        return reg;
    }
}
