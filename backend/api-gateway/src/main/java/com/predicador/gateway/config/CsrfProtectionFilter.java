package com.predicador.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Set;

/**
 * CSRF protection for the whole platform, implemented at the edge.
 *
 * <p>The gateway is the <em>single</em> owner of the {@code XSRF-TOKEN} cookie:
 * downstream services must never emit it. Two sources writing the same cookie on
 * the same response race each other and leave the browser with a token the SPA
 * cannot match.</p>
 *
 * <p>Strategy: stateless double-submit. A random token is delivered in a cookie
 * that JavaScript <em>must</em> be able to read, and the SPA echoes it back in
 * {@code X-XSRF-TOKEN}. A cross-site attacker can make the browser send the
 * cookie but cannot read it to build the header.</p>
 *
 * <p>Cookies are always built with {@link ResponseCookie} rather than hand-rolled
 * header strings: per RFC 6265 §5.2.6 a cookie carrying the literal
 * {@code HttpOnly=false} is still HttpOnly (the attribute value is ignored), which
 * silently makes the token unreadable and every mutation fail with 403.</p>
 */
@Component
public class CsrfProtectionFilter implements WebFilter, Ordered {

    /** Readable cookie holding the double-submit token. */
    static final String COOKIE_NAME = "XSRF-TOKEN";
    /** Header the SPA must echo the cookie value in. */
    static final String HEADER_NAME = "X-XSRF-TOKEN";
    /** Bootstrap endpoint: hands the SPA a fresh, readable token. */
    static final String BOOTSTRAP_PATH = "/api/v1/auth/csrf";
    /** Problem type clients match on to retry transparently. */
    static final String PROBLEM_TYPE = "https://api.predicador.com/errors/csrf-token-invalid";

    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * Endpoints reachable by a client that has no token yet. They authenticate
     * with credentials the attacker does not hold, or (RUM) cannot carry custom
     * headers because they ship via {@code navigator.sendBeacon}.
     *
     * <p>Account creation ({@code /encargados/buscar-crear}) is deliberately
     * absent: an exempt endpoint that mints a session is a login-CSRF vector.</p>
     */
    private static final Set<String> EXEMPT_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/encargados/login",
            "/api/v1/rum");

    /**
     * Paths that establish a session. The token is rotated when they succeed so
     * a token observed before authentication cannot be replayed afterwards.
     */
    private static final Set<String> SESSION_ISSUING_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/encargados/login",
            "/api/v1/encargados/buscar-crear");

    private static final String PROBLEM_BODY = """
            {"type":"%s","title":"Token CSRF ausente o inválido","status":403,\
            "detail":"La protección CSRF rechazó la petición. Reintentá la acción."}"""
            .formatted(PROBLEM_TYPE);

    @Value("${app.csrf.cookie-secure:false}")
    private boolean cookieSecure;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        // Always mints a new token: the client only calls this when its own copy
        // is missing or stale, so reusing the incoming cookie would strand it.
        if (BOOTSTRAP_PATH.equals(path)) {
            issueToken(exchange);
            exchange.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
            return exchange.getResponse().setComplete();
        }

        if (requiresToken(exchange.getRequest().getMethod(), path) && !hasMatchingToken(exchange)) {
            return reject(exchange);
        }

        if (SESSION_ISSUING_PATHS.contains(path)) {
            rotateTokenOnSuccess(exchange);
        } else {
            ensureToken(exchange);
        }

        return chain.filter(exchange);
    }

    private static boolean requiresToken(HttpMethod method, String path) {
        if (method == null || HttpMethod.GET.equals(method) || HttpMethod.HEAD.equals(method)
                || HttpMethod.OPTIONS.equals(method)) {
            return false;
        }
        return !EXEMPT_PATHS.contains(path);
    }

    private static boolean hasMatchingToken(ServerWebExchange exchange) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(COOKIE_NAME);
        String header = exchange.getRequest().getHeaders().getFirst(HEADER_NAME);
        return cookie != null && header != null && constantTimeEquals(cookie.getValue(), header);
    }

    /** Issues a token only when the client does not have one yet. */
    private void ensureToken(ServerWebExchange exchange) {
        if (exchange.getRequest().getCookies().containsKey(COOKIE_NAME)) {
            return;
        }
        issueToken(exchange);
    }

    /**
     * Replaces the token once the login response is known to have succeeded.
     * Deferred to {@code beforeCommit} so a failed login leaves the client's
     * current token untouched.
     */
    private void rotateTokenOnSuccess(ServerWebExchange exchange) {
        exchange.getResponse().beforeCommit(() -> {
            HttpStatusCode status = exchange.getResponse().getStatusCode();
            if (status != null && status.is2xxSuccessful()) {
                issueToken(exchange);
            } else {
                ensureToken(exchange);
            }
            return Mono.empty();
        });
    }

    private void issueToken(ServerWebExchange exchange) {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, HexFormat.of().formatHex(bytes))
                // Readable on purpose: the SPA has to copy it into the header.
                .httpOnly(false)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .build();
        exchange.getResponse().getCookies().set(COOKIE_NAME, cookie);
    }

    private static Mono<Void> reject(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        byte[] body = PROBLEM_BODY.getBytes(StandardCharsets.UTF_8);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body)));
    }

    private static boolean constantTimeEquals(String left, String right) {
        byte[] a = left.getBytes(StandardCharsets.UTF_8);
        byte[] b = right.getBytes(StandardCharsets.UTF_8);
        int difference = a.length ^ b.length;
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            difference |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
        }
        return difference == 0;
    }

    @Override
    public int getOrder() {
        // Reject forged mutations before routing or rate-limit accounting.
        return Ordered.HIGHEST_PRECEDENCE + 50;
    }
}
