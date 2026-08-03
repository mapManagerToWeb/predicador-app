package com.predicador.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Edge protections that are not CSRF: actuator exposure and CORS.
 *
 * @see CsrfProtectionFilterTest for the double-submit token contract
 */
class AuthCookieSecurityTest {

    @Test
    void actuatorFilter_blocksSensitiveEndpoints() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/actuator/env").build());

        new ActuatorAccessFilter().filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void actuatorFilter_allowsHealthProbes() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/actuator/health/readiness").build());

        new ActuatorAccessFilter().filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void corsConfiguration_allowsCredentialsAndConfiguredOrigin() {
        RouteConfig routeConfig = new RouteConfig();
        ReflectionTestUtils.setField(routeConfig, "allowedOrigins", "http://localhost:4200");
        assertThat(routeConfig.corsConfiguration().getAllowedOrigins())
                .containsExactly("http://localhost:4200");
        assertThat(routeConfig.corsConfiguration().getAllowCredentials()).isTrue();
    }
}
