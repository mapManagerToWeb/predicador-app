package com.predicador.gateway.config;

import org.springframework.core.Ordered;
import org.springframework.http.CacheControl;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Adds Cache-Control headers to territory read endpoints.
 *
 * <p>Replaces the {@code setResponseHeader} route filters that caused
 * {@code UnsupportedOperationException} when the circuit breaker fallback
 * committed the response before the header filter ran. Uses
 * {@code beforeCommit()} so headers are only set if the response reaches
 * the commit phase normally (i.e. not already committed by a fallback).</p>
 */
@Component
public class CacheHeadersFilter implements WebFilter, Ordered {

    private static final Map<String, CacheControl> CACHE_POLICIES = Map.of(
            "/api/v1/territories/colors",
            CacheControl.maxAge(600, TimeUnit.SECONDS),
            "/api/v1/territories/all/geojson",
            CacheControl.maxAge(300, TimeUnit.SECONDS)
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        CacheControl cc = CACHE_POLICIES.get(path);

        if (cc != null) {
            exchange.getResponse().beforeCommit(() -> {
                if (!exchange.getResponse().isCommitted()) {
                    exchange.getResponse().getHeaders().setCacheControl(cc.getHeaderValue());
                }
                return Mono.empty();
            });
        }

        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        // Run after SecurityHeadersFilter so cache headers don't conflict.
        return Ordered.LOWEST_PRECEDENCE - 5;
    }
}
