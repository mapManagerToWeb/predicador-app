package com.predicador.gateway.config;

import org.springframework.core.Ordered;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpCookie;
import org.springframework.http.ResponseCookie;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * Blocks external access to sensitive Actuator endpoints.
 *
 * <p>Prometheus scraping happens on the internal Docker/Kubernetes network,
 * not through the public gateway. This filter rejects any request to
 * {@code /actuator/**} that does not originate from a trusted internal
 * caller (identified by a configurable header or CIDR).</p>
 *
 * <p>Endpoints explicitly allowed through the gateway:
 * <ul>
 *   <li>{@code /actuator/health} and subpaths ({@code /actuator/health/liveness},
 *       {@code /actuator/health/readiness}) — required by container orchestrators
 *       and load balancers</li>
 * </ul>
 *
 * <p>All other actuator endpoints (env, beans, configprops, heapdump, threaddump,
 * prometheus, metrics, etc.) are blocked at the gateway level as defense-in-depth.</p>
 */
@Component
public class ActuatorAccessFilter implements WebFilter, Ordered {

    private static final String ACTUATOR_PREFIX = "/actuator";
    private static final String HEALTH_PREFIX = "/actuator/health";
    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Value("${app.csrf.cookie-secure:true}")
    private boolean csrfCookieSecure = true;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        if (path.equals("/api/v1/auth/csrf")) {
            addCsrfCookie(exchange);
            exchange.getResponse().setStatusCode(HttpStatus.NO_CONTENT);
            return exchange.getResponse().setComplete();
        }

        if (requiresCsrf(exchange.getRequest().getMethod(), path)
                && !hasMatchingCsrfToken(exchange)) {
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        addCsrfCookie(exchange);

        if (path.startsWith(ACTUATOR_PREFIX) && !isAllowed(path)) {
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }

    private static boolean requiresCsrf(HttpMethod method, String path) {
        if (method == null || method == HttpMethod.GET || method == HttpMethod.HEAD
                || method == HttpMethod.OPTIONS) {
            return false;
        }
        // Only pure login endpoints are exempt. /encargados/buscar-crear also
        // mints a session cookie, so it must NOT be exempt: an exempted
        // account-creating endpoint is a login-CSRF vector.
        return !path.equals("/api/v1/auth/login")
                && !path.equals("/api/v1/encargados/login");
    }

    private static boolean hasMatchingCsrfToken(ServerWebExchange exchange) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(CSRF_COOKIE);
        String header = exchange.getRequest().getHeaders().getFirst(CSRF_HEADER);
        return cookie != null && header != null && constantTimeEquals(cookie.getValue(), header);
    }

    private void addCsrfCookie(ServerWebExchange exchange) {
        if (exchange.getRequest().getCookies().containsKey(CSRF_COOKIE)) {
            return;
        }
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        ResponseCookie cookie = ResponseCookie.from(CSRF_COOKIE, HexFormat.of().formatHex(bytes))
                .httpOnly(false)
                .secure(csrfCookieSecure)
                .sameSite("Lax")
                .path("/")
                .build();
        exchange.getResponse().getHeaders().add("Set-Cookie", cookie.toString());
    }

    private static boolean constantTimeEquals(String left, String right) {
        byte[] a = left.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] b = right.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        int difference = a.length ^ b.length;
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            difference |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
        }
        return difference == 0;
    }

    /**
     * Allows {@code /actuator/health} exactly and any subpath under it
     * ({@code /actuator/health/liveness}, {@code /actuator/health/readiness}).
     * Everything else under {@code /actuator} is blocked.
     */
    private static boolean isAllowed(String path) {
        if (path.equals(HEALTH_PREFIX)) {
            return true;
        }
        // /actuator/health/* or /actuator/health/** — any subpath
        return path.startsWith(HEALTH_PREFIX + "/");
    }

    @Override
    public int getOrder() {
        // Run early, after SecurityHeadersFilter but before routing.
        return Ordered.HIGHEST_PRECEDENCE + 50;
    }
}
