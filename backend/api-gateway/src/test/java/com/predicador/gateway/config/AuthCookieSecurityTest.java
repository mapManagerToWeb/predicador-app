package com.predicador.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

class AuthCookieSecurityTest {

    @Test
    void csrfFilter_rejectsMutationWithoutMatchingToken() {
        ActuatorAccessFilter filter = new ActuatorAccessFilter();
        MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/reports")
                .cookie(new HttpCookie("XSRF-TOKEN", "cookie-token"))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void csrfFilter_allowsMutationWithMatchingToken() {
        ActuatorAccessFilter filter = new ActuatorAccessFilter();
        MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/reports")
                .cookie(new HttpCookie("XSRF-TOKEN", "csrf-token"))
                .header("X-XSRF-TOKEN", "csrf-token")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void csrfFilter_allowsPublicLoginBootstrapWithoutCsrfToken() {
        ActuatorAccessFilter filter = new ActuatorAccessFilter();
        MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/encargados/login")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void csrfEndpoint_deliversReadableSecureSameSiteToken() {
        ActuatorAccessFilter filter = new ActuatorAccessFilter();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/v1/auth/csrf").build());

        filter.filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getHeaders().getFirst("Set-Cookie"))
                .contains("XSRF-TOKEN=")
                .contains("Secure")
                .contains("SameSite=Lax")
                .doesNotContain("HttpOnly");
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
