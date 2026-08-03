package com.predicador.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Contract of the double-submit CSRF protection at the gateway.
 *
 * <p>The readability assertions are not cosmetic: a token the SPA cannot read
 * from {@code document.cookie} makes every mutation fail with 403.</p>
 */
class CsrfProtectionFilterTest {

    private static final String COOKIE = "XSRF-TOKEN";
    private static final String HEADER = "X-XSRF-TOKEN";

    private CsrfProtectionFilter filter(boolean secure) {
        CsrfProtectionFilter filter = new CsrfProtectionFilter();
        ReflectionTestUtils.setField(filter, "cookieSecure", secure);
        return filter;
    }

    private static ResponseCookie issuedToken(MockServerWebExchange exchange) {
        return exchange.getResponse().getCookies().getFirst(COOKIE);
    }

    @Test
    void rejectsMutationWithoutMatchingToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/reports")
                        .cookie(new HttpCookie(COOKIE, "cookie-token"))
                        .build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void rejectionCarriesRetriableProblemDetail() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/reports").build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getHeaders().getContentType())
                .hasToString("application/problem+json");
        assertThat(exchange.getResponse().getBodyAsString().block())
                .contains(CsrfProtectionFilter.PROBLEM_TYPE)
                .contains("\"status\":403");
    }

    @Test
    void allowsMutationWithMatchingToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/reports")
                        .cookie(new HttpCookie(COOKIE, "csrf-token"))
                        .header(HEADER, "csrf-token")
                        .build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void allowsPublicLoginBootstrapWithoutToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/encargados/login").build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void allowsRumBeaconWithoutToken() {
        // navigator.sendBeacon cannot attach custom headers, so the RUM sink
        // must be exempt from CSRF to avoid a 403 on every page load.
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/rum").build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void stillRequiresTokenOnAccountCreation() {
        // /encargados/buscar-crear mints a session cookie and must NOT be
        // exempt: an exempted account-creating endpoint is a login-CSRF vector.
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/encargados/buscar-crear").build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void bootstrapEndpointDeliversJsReadableSameSiteToken() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get(CsrfProtectionFilter.BOOTSTRAP_PATH).build());

        filter(true).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        ResponseCookie cookie = issuedToken(exchange);
        assertThat(cookie).isNotNull();
        assertThat(cookie.getValue()).isNotBlank();
        // The SPA copies this value into the header; HttpOnly would break it.
        assertThat(cookie.isHttpOnly()).isFalse();
        assertThat(cookie.isSecure()).isTrue();
        assertThat(cookie.getSameSite()).isEqualTo("Lax");
        assertThat(cookie.getPath()).isEqualTo("/");
        assertThat(exchange.getResponse().getHeaders().getFirst("Set-Cookie"))
                .doesNotContain("HttpOnly");
    }

    @Test
    void bootstrapEndpointRotatesEvenWhenClientAlreadySendsACookie() {
        // Self-healing path: the client only calls it when its own copy is
        // missing or unusable, so echoing the incoming cookie would strand it.
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get(CsrfProtectionFilter.BOOTSTRAP_PATH)
                        .cookie(new HttpCookie(COOKIE, "stale-token"))
                        .build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(issuedToken(exchange)).isNotNull();
        assertThat(issuedToken(exchange).getValue()).isNotEqualTo("stale-token");
    }

    @Test
    void issuesTokenWhenClientHasNone() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/territories").build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(issuedToken(exchange)).isNotNull();
    }

    @Test
    void keepsExistingTokenOnOrdinaryRequests() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/v1/territories")
                        .cookie(new HttpCookie(COOKIE, "existing-token"))
                        .build());

        filter(false).filter(exchange, ignored -> Mono.empty()).block();

        assertThat(issuedToken(exchange)).isNull();
    }

    @Test
    void rotatesTokenOnSuccessfulLogin() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/auth/login")
                        .cookie(new HttpCookie(COOKIE, "pre-login-token"))
                        .build());

        filter(false).filter(exchange, ignored -> {
            exchange.getResponse().setStatusCode(HttpStatus.OK);
            return exchange.getResponse().setComplete();
        }).block();

        assertThat(issuedToken(exchange)).isNotNull();
        assertThat(issuedToken(exchange).getValue()).isNotEqualTo("pre-login-token");
    }

    @Test
    void keepsTokenWhenLoginFails() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.method(HttpMethod.POST, "/api/v1/auth/login")
                        .cookie(new HttpCookie(COOKIE, "pre-login-token"))
                        .build());

        filter(false).filter(exchange, ignored -> {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }).block();

        assertThat(issuedToken(exchange)).isNull();
    }
}
