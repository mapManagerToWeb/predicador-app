package com.predicador.gateway.config;

import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCrypt;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthControllerTest {

    private static final String SECRET = "12345678901234567890123456789012";

    @Test
    void login_rejectsBlankCredentialsWithoutConfiguredAdmin() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()));

        var response = controller.login(Map.of("username", "", "password", ""));

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_rejectsLiteralAdminDefaults() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()));

        var response = controller.login(Map.of("username", "admin", "password", "admin"));

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_acceptsConfiguredBcryptHash() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1), "operator", "",
                BCrypt.hashpw("password", BCrypt.gensalt()));

        var response = controller.login(Map.of("username", "operator", "password", "password"));

        assertEquals(200, response.getStatusCode().value());
        assertFalse(((Map<?, ?>) response.getBody()).get("token").toString().isBlank());
    }

    @Test
    void strictMode_rejectsPlaintextOnlyConfiguration() {
        assertThrows(IllegalArgumentException.class,
                () -> new AuthController(new SessionTokenService(SECRET, 1), "operator", "password", ""));
    }

    @Test
    void localMode_acceptsExplicitPlaintextConfiguration() {
        SessionTokenService localTokens = new SessionTokenService(SECRET, 1, false, "local");
        AuthController controller = new AuthController(localTokens, "operator", "password", "");

        var response = controller.login(Map.of("username", "operator", "password", "password"));

        assertEquals(200, response.getStatusCode().value());
    }
}
