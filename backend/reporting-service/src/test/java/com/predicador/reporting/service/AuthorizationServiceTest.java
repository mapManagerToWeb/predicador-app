package com.predicador.reporting.service;

import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
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
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> authorizationService.authorizeOwner(encargado("7"), 8L));

        assertEquals(403, exception.getStatusCode().value());
    }

    private SessionToken encargado(String subject) {
        return new SessionToken(subject, SessionToken.ROLE_ENCARGADO, 1L, 2L);
    }

    private SessionToken admin() {
        return new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
    }
}
