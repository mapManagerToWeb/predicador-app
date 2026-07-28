package com.predicador.shared.security;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class SessionTokenServiceTest {

    private static final String SECRET = "test-secret-with-enough-entropy-xx";

    @Test
    void issueAndVerify_roundTrip() {
        SessionTokenService svc = new SessionTokenService(SECRET, 1);
        String token = svc.issue("42", SessionToken.ROLE_ENCARGADO);

        Optional<SessionToken> parsed = svc.verify(token);

        assertTrue(parsed.isPresent());
        assertEquals("42", parsed.get().subject());
        assertEquals(SessionToken.ROLE_ENCARGADO, parsed.get().role());
        assertFalse(parsed.get().isExpired(parsed.get().issuedAt()));
    }

    @Test
    void verify_rejectsTamperedSignature() {
        SessionTokenService svc = new SessionTokenService(SECRET, 1);
        String token = svc.issue("42", SessionToken.ROLE_ENCARGADO);
        String tampered = token.substring(0, token.length() - 2) + "XX";

        assertTrue(svc.verify(tampered).isEmpty());
    }

    @Test
    void verify_rejectsTamperedPayload() {
        SessionTokenService svc = new SessionTokenService(SECRET, 1);
        String token = svc.issue("42", SessionToken.ROLE_ENCARGADO);
        int dot = token.indexOf('.');
        // Replace the first char of the payload with something else, keep sig.
        char first = token.charAt(0);
        char replacement = (first == 'A') ? 'B' : 'A';
        String tampered = replacement + token.substring(1, dot) + token.substring(dot);

        assertTrue(svc.verify(tampered).isEmpty());
    }

    @Test
    void verify_rejectsGarbage() {
        SessionTokenService svc = new SessionTokenService(SECRET, 1);
        assertTrue(svc.verify(null).isEmpty());
        assertTrue(svc.verify("").isEmpty());
        assertTrue(svc.verify("no-dot-here").isEmpty());
        assertTrue(svc.verify(".").isEmpty());
        assertTrue(svc.verify("abc.def").isEmpty());
    }

    @Test
    void verify_rejectsForeignSecret() {
        SessionTokenService a = new SessionTokenService(SECRET, 1);
        SessionTokenService b = new SessionTokenService("otro-secreto-completamente-distinto", 1);
        String token = a.issue("42", SessionToken.ROLE_ENCARGADO);

        assertTrue(b.verify(token).isEmpty());
    }

    @Test
    void issue_failsWhenSecretMissing() {
        SessionTokenService svc = new SessionTokenService("", 1);
        assertFalse(svc.isConfigured());
        assertThrows(IllegalStateException.class,
                () -> svc.issue("42", SessionToken.ROLE_ENCARGADO));
    }

    @Test
    void hasRole_matchesExactString() {
        SessionToken t = new SessionToken("42", SessionToken.ROLE_ADMIN, 1L, 2L);
        assertTrue(t.hasRole(SessionToken.ROLE_ADMIN));
        assertFalse(t.hasRole(SessionToken.ROLE_ENCARGADO));
    }

    @Test
    void issue_rejectsSubjectWithSeparator() {
        SessionTokenService svc = new SessionTokenService(SECRET, 1);
        assertThrows(IllegalArgumentException.class,
                () -> svc.issue("bad|subject", SessionToken.ROLE_ENCARGADO));
        assertThrows(IllegalArgumentException.class,
                () -> svc.issue("ok", "role|with|pipe"));
    }
}
