package com.predicador.shared.security;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SecurityContextTest {
    @Test void getToken_returnsTokenSetOnCurrentThread() {
        SessionToken token = new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        SecurityContext.setToken(token);
        try {
            assertEquals(token, SecurityContext.getToken());
            assertEquals("42", SecurityContext.getSubject());
        } finally { SecurityContext.clear(); }
    }
    @Test void clear_removesToken() {
        SecurityContext.setToken(new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L));
        SecurityContext.clear();
        assertNull(SecurityContext.getToken());
    }
}