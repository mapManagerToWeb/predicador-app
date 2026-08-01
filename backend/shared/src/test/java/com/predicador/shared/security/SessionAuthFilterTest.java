package com.predicador.shared.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class SessionAuthFilterTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    // -- rutas no protegidas -----------------------------------------------

    @Test
    void routeNotMatchingRule_passesThrough_withoutToken() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                new SessionAuthFilter.Rule(List.of("POST"),
                        Pattern.compile("^/api/v1/reports$"), null)));

        MockHttpServletResponse res = doFilter(filter, "GET", "/api/v1/territories", null);

        assertEquals(200, res.getStatus());
    }

    // -- rutas protegidas ---------------------------------------------------

    @Test
    void protectedRoute_withValidToken_passes() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));

        MockHttpServletResponse res = doFilter(filter, "POST", "/api/v1/reports", encargadoToken);

        assertEquals(200, res.getStatus());
    }

    @Test
    void protectedRoute_withValidSessionCookie_passesWithoutHeader() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertEquals(200, res.getStatus());
        assertEquals("42", req.getAttribute(SessionAuthFilter.ATTR_SUBJECT));
    }

    @Test
    void invalidSessionCookie_doesNotFallBackToHeader() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(SessionAuthFilter.SESSION_COOKIE_NAME, "invalid"));
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertEquals(401, res.getStatus());
    }

    @Test
    void protectedRoute_withoutToken_returns401() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));

        MockHttpServletResponse res = doFilter(filter, "POST", "/api/v1/reports", null);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("Token de sesión ausente"));
    }

    @Test
    void protectedRoute_withInvalidToken_returns401() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));

        MockHttpServletResponse res = doFilter(filter, "POST", "/api/v1/reports",
                "not-a-real.token");

        assertEquals(401, res.getStatus());
    }

    // -- role gating --------------------------------------------------------

    @Test
    void adminRoute_withEncargadoToken_returns401() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)));

        MockHttpServletResponse res = doFilter(filter, "PUT", "/api/v1/territories/5/color",
                encargadoToken);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("Permisos insuficientes"));
    }

    @Test
    void adminRoute_withAdminToken_passes() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)));

        MockHttpServletResponse res = doFilter(filter, "PUT", "/api/v1/territories/5/color",
                adminToken);

        assertEquals(200, res.getStatus());
    }

    // -- local-only rollout --------------------------------------------------

    @Test
    void unconfiguredSecret_passesThroughEverything() throws Exception {
        SessionTokenService disabled = new SessionTokenService("", 1, false, "local");
        SessionAuthFilter filter = new SessionAuthFilter(disabled, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));

        MockHttpServletResponse res = doFilter(filter, "POST", "/api/v1/reports", null);

        // Filter is disabled → chain runs → default 200.
        assertEquals(200, res.getStatus());
    }

    // -- request attributes -------------------------------------------------

    @Test
    void validToken_attachesSubjectAsRequestAttribute() throws Exception {
        SessionAuthFilter filter = new SessionAuthFilter(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)));

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertEquals("42", req.getAttribute(SessionAuthFilter.ATTR_SUBJECT));
        Object tokenAttr = req.getAttribute(SessionAuthFilter.ATTR_TOKEN);
        assertInstanceOf(SessionToken.class, tokenAttr);
    }

    // -- helper -------------------------------------------------------------

    private static MockHttpServletResponse doFilter(SessionAuthFilter filter, String method,
            String uri, String token) throws ServletException, IOException {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (token != null) {
            req.addHeader(SessionAuthFilter.HEADER_NAME, token);
        }
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = new MockFilterChain();
        filter.doFilter(req, res, chain);
        return res;
    }
}
