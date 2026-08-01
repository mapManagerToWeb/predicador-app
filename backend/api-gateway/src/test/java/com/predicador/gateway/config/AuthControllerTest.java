package com.predicador.gateway.config;

import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class AuthControllerTest {

    private static final String SECRET = "12345678901234567890123456789012";

    @Test
    void login_rejectsBlankCredentialsWithoutConfiguredAdmin() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1));

        var response = controller.login(Map.of("username", "", "password", ""));

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_rejectsLiteralAdminDefaults() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1));

        var response = controller.login(Map.of("username", "admin", "password", "admin"));

        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void login_acceptsConfiguredBcryptHash() {
        AuthController controller = new AuthController(new SessionTokenService(SECRET, 1));
        ReflectionTestUtils.setField(controller, "adminUsername", "operator");
        ReflectionTestUtils.setField(controller, "adminPasswordBcrypt", BCrypt.hashpw("password", BCrypt.gensalt()));

        var response = controller.login(Map.of("username", "operator", "password", "password"));

        assertEquals(200, response.getStatusCode().value());
        assertFalse(((Map<?, ?>) response.getBody()).get("token").toString().isBlank());
    }
}
