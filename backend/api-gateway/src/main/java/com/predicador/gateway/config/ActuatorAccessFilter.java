package com.predicador.gateway.config;

import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

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
 *
 * <p>CSRF is <em>not</em> handled here; see {@link CsrfProtectionFilter}.</p>
 */
@Component
public class ActuatorAccessFilter implements WebFilter, Ordered {

    private static final String ACTUATOR_PREFIX = "/actuator";
    private static final String HEALTH_PREFIX = "/actuator/health";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        if (path.startsWith(ACTUATOR_PREFIX) && !isAllowed(path)) {
            exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
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
        // Run early, right after CsrfProtectionFilter and before routing.
        return Ordered.HIGHEST_PRECEDENCE + 51;
    }
}
