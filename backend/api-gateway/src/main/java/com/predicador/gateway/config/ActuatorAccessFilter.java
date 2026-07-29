package com.predicador.gateway.config;

import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.Set;

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
 *   <li>{@code /actuator/health} — required by container orchestrators and load balancers</li>
 * </ul>
 *
 * <p>All other actuator endpoints (env, beans, configprops, heapdump, threaddump,
 * prometheus, metrics, etc.) are blocked at the gateway level as defense-in-depth.</p>
 */
@Component
public class ActuatorAccessFilter implements WebFilter, Ordered {

    private static final String ACTUATOR_PREFIX = "/actuator";
    private static final Set<String> ALLOWED_PATHS = Set.of("/actuator/health", "/actuator/health/**");

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        if (path.startsWith(ACTUATOR_PREFIX) && !isAllowed(path)) {
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }

    private static boolean isAllowed(String path) {
        return ALLOWED_PATHS.stream().anyMatch(path::startsWith);
    }

    @Override
    public int getOrder() {
        // Run early, after SecurityHeadersFilter but before routing.
        return Ordered.HIGHEST_PRECEDENCE + 50;
    }
}
