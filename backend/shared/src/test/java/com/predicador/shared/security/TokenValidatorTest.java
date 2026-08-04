package com.predicador.shared.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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
        var cookie = new SimpleCookieSource(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken, null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isPresent());
        assertEquals("42", result.get().subject());
    }

    @Test
    void missingToken_returnsEmpty() {
        var cookie = new SimpleCookieSource(null, null, null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void invalidToken_returnsEmpty() {
        var cookie = new SimpleCookieSource(SessionAuthFilter.SESSION_COOKIE_NAME, "garbage", null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void roleMismatch_returnsEmpty() {
        var cookie = new SimpleCookieSource(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken, null);
        var result = validator.validate("PUT", "/api/v1/territories/5/color", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void nonMatchingRoute_returnsEmpty() {
        var result = validator.validate("GET", "/api/v1/territories",
                new SimpleCookieSource(null, null, null));

        assertTrue(result.isEmpty());
    }

    @Test
    void headerAuth_whenAllowed_usesHeader() {
        TokenValidator headerValidator = new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)
        ), true);
        var cookie = new SimpleCookieSource(null, null, encargadoToken);

        var result = headerValidator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isPresent());
    }

    @Test
    void headerAuth_whenNotAllowed_ignoresHeader() {
        var cookie = new SimpleCookieSource(null, null, encargadoToken);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    private record SimpleCookieSource(String cookieName, String cookieValue, String headerValue)
            implements TokenValidator.CookieSource {

        @Override
        public String getCookieValue(String name) {
            return cookieName != null && cookieName.equals(name) ? cookieValue : null;
        }

        @Override
        public String getHeaderValue(String name) {
            return headerValue;
        }
    }
}
