package com.predicador.gateway.integration;

import com.predicador.gateway.config.ActuatorAccessFilter;
import com.predicador.gateway.config.CsrfProtectionFilter;
import com.predicador.gateway.config.SecurityHeadersFilter;
import com.predicador.gateway.controller.FallbackController;
import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.test.web.reactive.server.EntityExchangeResult;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for API gateway filter chain behavior:
 * security headers, actuator blocking, CSRF, and ProblemDetail responses.
 *
 * <p>Uses WebTestClient with standalone setup to test filters without
 * requiring Eureka, downstream services, or Docker.</p>
 */
class GatewayFilterIntegrationTest {

    private static final String SECRET = "test-secret-for-integration-1234567890";

    private WebTestClient webTestClient;
    private SecurityHeadersFilter securityHeadersFilter;
    private ActuatorAccessFilter actuatorFilter;
    private CsrfProtectionFilter csrfFilter;

    @BeforeEach
    void setUp() {
        securityHeadersFilter = new SecurityHeadersFilter();
        actuatorFilter = new ActuatorAccessFilter();
        csrfFilter = new CsrfProtectionFilter();

        var tokenService = new SessionTokenService(SECRET, 12);

        var authController = new com.predicador.gateway.controller.AuthController(
                tokenService, "admin", "password",
                org.springframework.security.crypto.bcrypt.BCrypt.hashpw("password",
                        org.springframework.security.crypto.bcrypt.BCrypt.gensalt()),
                false);

        var fallbackController = new FallbackController();

        webTestClient = WebTestClient
                .bindToController(authController, fallbackController)
                .webFilter(securityHeadersFilter)
                .webFilter(csrfFilter)
                .webFilter(actuatorFilter)
                .build();
    }

    @Test
    void securityHeaders_arePresentOnResponses() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", "admin", "password", "wrong"))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().valueEquals("X-Content-Type-Options", "nosniff")
                .expectHeader().valueEquals("X-Frame-Options", "DENY")
                .expectHeader().valueEquals("Referrer-Policy", "strict-origin-when-cross-origin")
                .expectHeader().valueEquals("Permissions-Policy",
                        "geolocation=(self), microphone=(), camera=(), payment=()");
    }

    @Test
    void actuator_nonHealthEndpoints_areBlocked() {
        webTestClient.get()
                .uri("/actuator/env")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void actuator_nonHealthEndpoints_post_areBlocked() {
        webTestClient.post()
                .uri("/actuator/beans")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void fallback_territory_returnsProblemDetail() {
        webTestClient.get()
                .uri("/fallback/territory")
                .exchange()
                .expectStatus().is5xxServerError()
                .expectHeader().contentType(MediaType.APPLICATION_JSON)
                .expectBody()
                .jsonPath("$.title").isEqualTo("Servicio no disponible")
                .jsonPath("$.detail").isEqualTo("El servicio de territorios no está disponible.");
    }

    @Test
    void fallback_reporting_returnsProblemDetail() {
        webTestClient.get()
                .uri("/fallback/reporting")
                .exchange()
                .expectStatus().is5xxServerError()
                .expectHeader().contentType(MediaType.APPLICATION_JSON)
                .expectBody()
                .jsonPath("$.title").isEqualTo("Servicio no disponible")
                .jsonPath("$.detail").isEqualTo("El servicio de reportes no está disponible.");
    }

    @Test
    void login_validCredentials_returnsSessionCookie() {
        EntityExchangeResult<byte[]> result = webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", "admin", "password", "password"))
                .exchange()
                .expectStatus().isOk()
                .expectBody().returnResult();

        java.util.List<String> cookies = result.getResponseHeaders().get("Set-Cookie");
        assertThat(cookies).isNotNull();
        assertThat(cookies).hasSize(2);
        assertThat(cookies).anyMatch(c -> c.contains("predicador_session=") && c.contains("HttpOnly") && c.contains("SameSite=Lax"));
        // El token CSRF se rota al autenticar y debe quedar legible por el SPA:
        // con HttpOnly el navegador lo enviaría pero JS no podría copiarlo al
        // header X-XSRF-TOKEN y toda mutación posterior daría 403.
        assertThat(cookies).anyMatch(c -> c.contains("XSRF-TOKEN=") && !c.contains("HttpOnly"));
    }

    @Test
    void login_invalidCredentials_returns401ProblemDetail() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", "admin", "password", "wrong"))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Autenticación fallida")
                .jsonPath("$.detail").isEqualTo("Credenciales incorrectas")
                .jsonPath("$.type").isEqualTo("https://api.predicador.com/errors/auth-failed");
    }

    @Test
    void login_blankCredentials_returns401ProblemDetail() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", "", "password", ""))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Autenticación fallida");
    }

    @Test
    void logout_withCsrfToken_returns204NoContent() {
        webTestClient.post()
                .uri("/api/v1/auth/logout")
                .cookie("XSRF-TOKEN", "valid-csrf-token")
                .header("X-XSRF-TOKEN", "valid-csrf-token")
                .exchange()
                .expectStatus().isNoContent();
    }

    @Test
    void logout_withoutCsrfToken_returns403() {
        webTestClient.post()
                .uri("/api/v1/auth/logout")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void encargadosBuscarCrear_withoutCsrfToken_returns403() {
        webTestClient.post()
                .uri("/api/v1/encargados/buscar-crear")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("nombre", "A", "apellido", "B", "telefono", "56912345678"))
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    void encargadosBuscarCrear_withCsrfToken_passesCsrfCheck() {
        webTestClient.post()
                .uri("/api/v1/encargados/buscar-crear")
                .cookie("XSRF-TOKEN", "valid-csrf-token")
                .header("X-XSRF-TOKEN", "valid-csrf-token")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("nombre", "A", "apellido", "B", "telefono", "56912345678"))
                .exchange()
                .expectStatus().isNotFound();
    }
}
