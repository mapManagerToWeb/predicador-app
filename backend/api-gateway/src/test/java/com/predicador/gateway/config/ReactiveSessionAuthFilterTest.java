package com.predicador.gateway.config;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.TokenValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ReactiveSessionAuthFilterTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private ReactiveSessionAuthFilter filter;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        filter = new ReactiveSessionAuthFilter(new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null),
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        )));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_setsAttributesAndContinues() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filter.filter(exchange, ex -> {
            assertEquals("42", ex.getAttribute("predicador.session.subject"));
            assertNotNull(ex.getAttribute("predicador.session.token"));
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0]);
    }

    @Test
    void missingToken_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ex -> Mono.empty()).block();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }

    @Test
    void nonMatchingRoute_passesThrough() {
        MockServerHttpRequest request = MockServerHttpRequest
                .get("/api/v1/territories")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        final boolean[] chainCalled = {false};

        filter.filter(exchange, ex -> {
            chainCalled[0] = true;
            return Mono.empty();
        }).block();

        assertTrue(chainCalled[0]);
    }

    @Test
    void roleMismatch_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .put("/api/v1/territories/5/color")
                .cookie(new HttpCookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        filter.filter(exchange, ex -> Mono.empty()).block();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }
}
