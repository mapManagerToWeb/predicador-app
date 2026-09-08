package com.predicador.gateway.config;

import com.predicador.gateway.controller.AuthController;
import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.crypto.bcrypt.BCrypt;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.assertj.core.api.Assertions.assertThat;

class AuthControllerTest {

    private static final String SECRET = "12345678901234567890123456789012";
    private static final String SESSION_COOKIE = "predicador_session";

    private static MockServerWebExchange exchange() {
        return MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/auth/login"));
    }

    private static ResponseCookie sessionCookie(MockServerWebExchange exchange) {
        return exchange.getResponse().getCookies().getFirst(SESSION_COOKIE);
    }

    @Test
    void login_rejectsBlankCredentialsWithoutConfiguredAdmin() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), true);

        var response = controller.login(Map.of("username", "", "password", ""), exchange());

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_rejectsLiteralAdminDefaults() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), true);

        var response = controller.login(Map.of("username", "admin", "password", "admin"), exchange());

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_acceptsConfiguredBcryptHash() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), true);

        MockServerWebExchange exchange = exchange();
        var response = controller.login(Map.of("username", "operator", "password", "password"), exchange);

        assertEquals(200, response.getStatusCode().value());
        assertFalse(((Map<?, ?>) response.getBody()).containsKey("token"));
        ResponseCookie session = sessionCookie(exchange);
        assertThat(session).isNotNull();
        assertThat(session.getValue()).isNotBlank();
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.isSecure()).isTrue();
        assertThat(session.getSameSite()).isEqualTo("Lax");
    }

    @Test
    void logout_expiresSessionCookie() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), true);

        MockServerWebExchange exchange = exchange();
        var response = controller.logout(exchange);

        assertEquals(204, response.getStatusCode().value());
        ResponseCookie session = sessionCookie(exchange);
        assertThat(session).isNotNull();
        assertThat(session.getValue()).isEmpty();
        assertThat(session.getMaxAge()).isZero();
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.isSecure()).isTrue();
    }

    @Test
    void strictMode_rejectsPlaintextOnlyConfiguration() {
        assertThrows(IllegalArgumentException.class,
                () -> new AuthController(new SessionTokenService(SECRET, 1), "operator", "password", "", true));
    }

    @Test
    void localMode_acceptsExplicitPlaintextConfiguration() {
        SessionTokenService localTokens = new SessionTokenService(SECRET, 1, false, "local");
        AuthController controller = new AuthController(localTokens, "operator", "password", "", false);

        var response = controller.login(Map.of("username", "operator", "password", "password"), exchange());

        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void localHttpOverride_omitsSecureAttribute() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), false);

        MockServerWebExchange exchange = exchange();
        controller.login(Map.of("username", "operator", "password", "password"), exchange);

        assertThat(sessionCookie(exchange).isSecure()).isFalse();
    }

    @Test
    void login_setsOnlyTheSessionCookie() {
        // El token CSRF lo emite y rota CsrfProtectionFilter en el edge. Si el
        // controller también lo emitiera, la respuesta llevaría dos Set-Cookie
        // XSRF-TOKEN con valores distintos y el SPA quedaría desincronizado.
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()), true);

        MockServerWebExchange exchange = exchange();
        controller.login(Map.of("username", "operator", "password", "password"), exchange);

        assertThat(exchange.getResponse().getCookies().keySet()).containsExactly(SESSION_COOKIE);
    }

    @Test
    void springBinding_rejectsMissingAdminPropertiesInsteadOfUsingInsecureDefaults() {
        new ApplicationContextRunner()
                .withUserConfiguration(PropertyBindingConfiguration.class)
                .withPropertyValues("app.session.secret=" + SECRET)
                .run(context -> assertThat(context.getStartupFailure())
                        .isNotNull()
                        .hasRootCauseInstanceOf(IllegalArgumentException.class));
    }

    @Configuration(proxyBeanMethods = false)
    @Import(AuthController.class)
    static class PropertyBindingConfiguration {

        @Bean
        SessionTokenService sessionTokenService() {
            return new SessionTokenService(SECRET, 1);
        }
    }
}
