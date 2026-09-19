package com.predicador.gateway.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.webflux.autoconfigure.WebFluxProperties;
import org.springframework.cloud.client.circuitbreaker.ReactiveCircuitBreakerFactory;
import org.springframework.cloud.gateway.filter.factory.RetryGatewayFilterFactory;
import org.springframework.cloud.gateway.filter.factory.SpringCloudCircuitBreakerFilterFactory;
import org.springframework.cloud.gateway.filter.factory.SpringCloudCircuitBreakerResilience4JFilterFactory;
import org.springframework.cloud.gateway.handler.predicate.PathRoutePredicateFactory;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Route-level regression tests for {@link RouteConfig}. Guards the retry
 * behaviour added for tile resilience (F7 parity): the high-frequency MVT
 * route must retry GET once with the catch-all backoff so a transient 503
 * during a backend restart does not leave the map with a blank mosaic.
 */
class RouteConfigTest {

    private final ConfigurableApplicationContext ctx = context();
    private final RouteConfig config = new RouteConfig();

    private static ConfigurableApplicationContext context() {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        // PredicateSpec.path resolves the path factory eagerly at spec time.
        when(ctx.getBean(PathRoutePredicateFactory.class))
                .thenReturn(new PathRoutePredicateFactory(new WebFluxProperties()));
        // GatewayFilterSpec.circuitBreaker/retry also resolve their factories
        // eagerly; the concrete Resilience4J variant satisfies the abstract
        // SpringCloudCircuitBreakerFilterFactory bean lookup.
        when(ctx.getBean(RetryGatewayFilterFactory.class))
                .thenReturn(new RetryGatewayFilterFactory());
        when(ctx.getBean(SpringCloudCircuitBreakerFilterFactory.class))
                .thenReturn(new SpringCloudCircuitBreakerResilience4JFilterFactory(
                        mock(ReactiveCircuitBreakerFactory.class), mock(ObjectProvider.class)));
        return ctx;
    }

    private Route route(String id) {
        RouteLocator locator = config.customRouteLocator(new RouteLocatorBuilder(ctx));
        return locator.getRoutes().toStream()
                .filter(r -> r.getId().equals(id))
                .findFirst()
                .orElseThrow(() -> new AssertionError("route '" + id + "' not found"));
    }

    @Test
    void territoryTilesRoute_targetsTerritoryService() {
        Route route = route("territory-tiles");

        assertThat(route.getUri().toString()).isEqualTo("lb://territory-service");
    }

    @Test
    void territoryTilesRoute_retriesGetOnceWithCatchAllBackoff() {
        Route route = route("territory-tiles");

        assertThat(route.getFilters())
                .as("territory-tiles must carry a retry filter (F7 parity)")
                .anyMatch(f -> f.toString().contains("territory-tiles") && f.toString().contains("retries = 1"));
    }

    @Test
    void territoryTilesRoute_retryUsesCatchAllBackoffAndGetOnly() {
        Route route = route("territory-tiles");

        String retry = route.getFilters().stream()
                .map(Object::toString)
                .filter(s -> s.contains("territory-tiles") && s.contains("retries = 1"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no retry filter on territory-tiles"));

        assertThat(retry)
                .contains("retries = 1")
                .contains("methods = list[GET]")
                .contains("firstBackoff = PT0.1S")
                .contains("maxBackoff = PT1S")
                .contains("factor = 2");
    }
}