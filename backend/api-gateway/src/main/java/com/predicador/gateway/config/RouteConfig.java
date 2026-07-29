package com.predicador.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * Gateway routing configuration.
 *
 * <p>Downstream URIs use the {@code lb://<service-id>} scheme so Spring Cloud
 * LoadBalancer resolves them against Eureka. This makes the gateway portable
 * outside {@code docker-compose} (previous hard-coded DNS names only worked in
 * that network).</p>
 *
 * <p>Each route is protected by a Resilience4j circuit breaker with a retry
 * on idempotent verbs. Timeouts and thresholds live in {@code application.yml}
 * for the gateway.</p>
 */
@Configuration
public class RouteConfig {

    @Value("${app.cors.allowed-origins:http://localhost:4200}")
    private String allowedOrigins;

    private static final Set<HttpMethod> IDEMPOTENT = Set.of(
            HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS);

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("territory-colors", r -> r
                        .path("/api/v1/territories/colors")
                        .filters(f -> f
                                .setResponseHeader(HttpHeaders.CACHE_CONTROL, "max-age=600")
                                .circuitBreaker(c -> c.setName("territoryCB")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("territory-geojson-all", r -> r
                        .path("/api/v1/territories/all/geojson")
                        .filters(f -> f
                                .setResponseHeader(HttpHeaders.CACHE_CONTROL, "max-age=300")
                                .circuitBreaker(c -> c.setName("territoryCB")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("territory-service", r -> r
                        .path("/api/v1/territories/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("territoryCB")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("reporting-service", r -> r
                        .path("/api/v1/reports/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("reportingCB")
                                        .setFallbackUri("forward:/fallback/reporting"))
                                .retry(config -> config
                                        .setRetries(1)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(200), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://reporting-service"))
                .route("encargados-service", r -> r
                        .path("/api/v1/encargados/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("reportingCB")
                                        .setFallbackUri("forward:/fallback/reporting"))
                                .retry(config -> config
                                        .setRetries(1)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(200), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://reporting-service"))
                // Real User Monitoring sink: público, alto volumen, sin retries
                // (métrica idempotente pero perder una es aceptable).
                .route("rum-sink", r -> r
                        .path("/api/v1/rum")
                        .filters(f -> f.circuitBreaker(c -> c.setName("reportingCB")
                                .setFallbackUri("forward:/fallback/reporting")))
                        .uri("lb://reporting-service"))
                .build();
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("ETag", "Location"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }

    /** Marker exposed so tests / metrics can see which HTTP verbs are idempotent. */
    public static Set<HttpMethod> idempotentMethods() {
        return IDEMPOTENT;
    }

    /** Marker for the fallback controller in case the enum value is needed. */
    public static HttpStatus circuitOpenStatus() {
        return HttpStatus.SERVICE_UNAVAILABLE;
    }
}
