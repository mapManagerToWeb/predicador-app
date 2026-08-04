package com.predicador.shared.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TokenValidatorTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private TokenValidator validator;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        validator = new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null),
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        ));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_returnsSessionToken() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken));

        var result = validator.validate(req);

        assertTrue(result.isPresent());
        assertEquals("42", result.get().subject());
    }

    @Test
    void missingToken_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void invalidToken_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, "garbage"));

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void roleMismatch_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("PUT",
                "/api/v1/territories/5/color");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken));

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void nonMatchingRoute_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/territories");

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void headerAuth_whenAllowed_usesHeader() {
        TokenValidator headerValidator = new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)
        ), true);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);

        var result = headerValidator.validate(req);

        assertTrue(result.isPresent());
    }

    @Test
    void headerAuth_whenNotAllowed_ignoresHeader() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }
}
