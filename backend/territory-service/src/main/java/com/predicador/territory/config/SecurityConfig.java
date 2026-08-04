package com.predicador.territory.config;

import com.predicador.shared.security.SecurityRule;
import com.predicador.shared.security.SecurityRules;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * Wires {@link SessionAuthFilter} for territory-service.
 *
 * <p>The territory data itself (GeoJSON, colors, numbers) is public because
 * the map renders it before the user logs in. Only mutations require auth,
 * and specifically only an <strong>admin</strong> token can change colors
 * (the admin panel is the sole consumer of this endpoint).</p>
 */
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
                new SessionAuthFilter(tokens, SecurityRules.TERRITORY));
        reg.setName("sessionAuthFilter");
        reg.setOrder(-100);
        reg.addUrlPatterns("/api/v1/*");
        return reg;
    }
}
