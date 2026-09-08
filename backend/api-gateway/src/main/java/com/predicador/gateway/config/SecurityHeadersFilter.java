package com.predicador.gateway.config;

import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * Adds baseline security headers to every response leaving the API gateway.
 *
 * <p>Deliberately conservative: no {@code Content-Security-Policy} yet because
 * the frontend relies on external tile providers (OpenStreetMap, CartoDB,
 * ArcGIS) plus {@code html2canvas}. A strict CSP would break the map and the
 * screenshot capture until every source is enumerated. Ship headers that are
 * safe on day one and grow from there.</p>
 */
@Component
public class SecurityHeadersFilter implements WebFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        exchange.getResponse().beforeCommit(() -> {
            HttpHeaders headers = exchange.getResponse().getHeaders();
            addIfAbsent(headers, "X-Content-Type-Options", "nosniff");
            addIfAbsent(headers, "X-Frame-Options", "DENY");
            addIfAbsent(headers, "Referrer-Policy", "strict-origin-when-cross-origin");
            addIfAbsent(headers, "Permissions-Policy",
                    "geolocation=(self), microphone=(), camera=(), payment=()");
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    private static void addIfAbsent(HttpHeaders headers, String name, String value) {
        if (headers.getFirst(name) == null) {
            headers.add(name, value);
        }
    }

    @Override
    public int getOrder() {
        // Run late so downstream filters can override if they need to.
        return Ordered.LOWEST_PRECEDENCE - 10;
    }
}
