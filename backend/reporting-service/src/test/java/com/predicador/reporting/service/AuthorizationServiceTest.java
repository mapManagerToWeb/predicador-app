package com.predicador.reporting.service;

import com.predicador.shared.exception.ForbiddenOperationException;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthorizationServiceTest {

    private final AuthorizationService authorizationService = new AuthorizationService();

    @Test
    void authorizeOwner_allowsMatchingEncargado() {
        assertDoesNotThrow(() -> authorizationService.authorizeOwner(encargado("7"), 7L));
    }

    @Test
    void authorizeOwner_allowsAdminForAnyOwner() {
        assertDoesNotThrow(() -> authorizationService.authorizeOwner(admin(), 99L));
    }

    @Test
    void authorizeOwner_rejectsDifferentEncargadoWithForbidden() {
        ForbiddenOperationException exception = assertThrows(ForbiddenOperationException.class,
                () -> authorizationService.authorizeOwner(encargado("7"), 8L));
    }

    @Test
    void authorizeOwner_allowsNullTokenInUnenforcedDevMode() {
        var unconfiguredTokens = new com.predicador.shared.security.SessionTokenService("", 12, false, "local");
        var devAuthService = new AuthorizationService(unconfiguredTokens);
        assertDoesNotThrow(() -> devAuthService.authorizeOwner(null, 7L));
        assertDoesNotThrow(() -> devAuthService.requireAuthenticated(null));
        assertDoesNotThrow(() -> devAuthService.requireAdmin(null));
    }

    private SessionToken encargado(String subject) {
        return new SessionToken(subject, SessionToken.ROLE_ENCARGADO, 1L, 2L);
    }

    private SessionToken admin() {
        return new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
    }
}
