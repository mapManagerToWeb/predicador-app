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
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Route-level regression tests for {@link RouteConfig}. Guards the retry
 * behaviour added for tile resilience (F7 parity): the high-frequency MVT
 * route must retry GET once with the catch-all backoff so a transient 503
 * during a backend restart does not leave the map with a blank mosaic.
 *
 * <p>Also guards the cold-start hardening: the {@code territory-tiles} route
 * carries a binary fallback ({@code forward:/fallback/tile}) so open-circuit
 * responses stay MVT-correct for MapLibre, and {@code territory-tiles-json}
 * uses its own circuit breaker ({@code territoryCB-tilesjson}) so tile bursts
 * do not poison version polling.</p>
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

    @Test
    void territoryTilesRoute_circuitBreakerHasBinaryTileFallback() {
        Route route = route("territory-tiles");
        String filters = route.getFilters().toString();

        assertThat(filters)
                .as("territory-tiles CB must keep its name and gain the binary tile fallback")
                .contains("territoryCB-tiles")
                .contains("forward:/fallback/tile");
    }

    @Test
    void territoryTilesRoute_stillRetriesWithFallbackInPlace() {
        Route route = route("territory-tiles");
        String filters = route.getFilters().toString();

        assertThat(filters)
                .as("fallback must not replace the retry on the .pbf route")
                .contains("forward:/fallback/tile")
                .contains("retries = 1");
    }

    @Test
    void territoryTilesJsonRoute_usesDedicatedCircuitBreaker() {
        Route route = route("territory-tiles-json");
        String filters = route.getFilters().toString();

        assertThat(filters)
                .as("tiles-json must use the split CB (territoryCB-tilesjson)")
                .contains("territoryCB-tilesjson");
    }

    @Test
    void territoryTilesJsonRoute_hasNoRetryAndNoFallback() {
        Route route = route("territory-tiles-json");
        String filters = route.getFilters().toString();

        assertThat(filters)
                .as("tiles-json must stay a plain GET without retry or fallback")
                .doesNotContain("retries = 1")
                .doesNotContain("forward:/fallback");
    }

    // ------------------------------------------------------------------
    // F5: removal of the bulk snapshot route (territory-geojson-all).
    // ------------------------------------------------------------------

    /**
     * Returns every route whose predicate matches the given request path,
     * evaluated against a mocked exchange (no live gateway needed).
     */
    private List<Route> routesMatching(String path) {
        ServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get(path).build());
        return config.customRouteLocator(new RouteLocatorBuilder(ctx))
                .getRoutes().toStream()
                .filter(r -> Boolean.TRUE.equals(
                        Mono.from(r.getPredicate().apply(exchange)).block()))
                .toList();
    }

    @Test
    void territoryGeojsonAllDedicatedRoute_isRemoved() {
        List<Route> routes = config.customRouteLocator(new RouteLocatorBuilder(ctx))
                .getRoutes().toStream().toList();

        assertThat(routes)
                .as("the dedicated bulk-snapshot route must be gone (F5 BREAKING)")
                .noneMatch(r -> r.getId().equals("territory-geojson-all"));

        String allFilters = routes.stream()
                .map(r -> r.getFilters().toString())
                .reduce("", (a, b) -> a + " " + b);

        assertThat(allFilters)
                .as("no route may reference the removed circuit breaker")
                .doesNotContain("territoryCB-geojson")
                .doesNotContain("territory-geojson-all");
    }

    @Test
    void allGeoJsonPath_isForwardedOnlyByGenericTerritoryRoute() {
        List<Route> matches = routesMatching("/api/v1/territories/all/geojson");

        assertThat(matches)
                .as("only the generic catch-all may still match — the dedicated "
                        + "snapshot route (territoryCB-geojson) is gone, so the "
                        + "request reaches territory-service where the controller "
                        + "no longer exists → 404 with no territory data")
                .hasSize(1);
        assertThat(matches.get(0).getId()).isEqualTo("territory-service");
        assertThat(matches.get(0).getUri().toString()).isEqualTo("lb://territory-service");
    }

    @Test
    void territoryMetadataPath_matchesGenericTerritoryRoute() {
        List<Route> matches = routesMatching("/api/v1/territories/metadata");

        assertThat(matches)
                .as("the lightweight metadata endpoint must keep routing downstream")
                .hasSize(1);
        assertThat(matches.get(0).getId()).isEqualTo("territory-service");
        assertThat(matches.get(0).getUri().toString()).isEqualTo("lb://territory-service");
    }
}