package com.predicador.gateway.config;

import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SecurityRule;
import com.predicador.shared.security.SecurityRules;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.TokenValidator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

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

    private static final String REPORTING_CB = "reportingCB";
    private static final String ENCARGADOS_CB = "encargadosCB";
    private static final String RUM_CB = "rumCB";
    private static final String REPORTING_FALLBACK = "forward:/fallback/reporting";
    private static final String REPORTING_SERVICE_URI = "lb://reporting-service";

    @Value("${app.cors.allowed-origins:}")
    private String allowedOrigins;

    @Bean
    public TokenValidator tokenValidator(SessionTokenService tokens) {
        return new TokenValidator(tokens, SecurityRules.GATEWAY);
    }

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("territory-colors", r -> r
                        .path("/api/v1/territories/colors")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("territoryCB-colors")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("territory-geojson-all", r -> r
                        .path("/api/v1/territories/all/geojson")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("territoryCB-geojson")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("territory-service", r -> r
                        .path("/api/v1/territories/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName("territoryCB-default")
                                        .setFallbackUri("forward:/fallback/territory"))
                                .retry(config -> config
                                        .setRetries(2)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                        .uri("lb://territory-service"))
                .route("reporting-service", r -> r
                        .path("/api/v1/reports/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName(REPORTING_CB)
                                        .setFallbackUri(REPORTING_FALLBACK))
                                .retry(config -> config
                                        .setRetries(1)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(200), Duration.ofSeconds(1), 2, true)))
                        .uri(REPORTING_SERVICE_URI))
                .route("encargados-service", r -> r
                        .path("/api/v1/encargados/**")
                        .filters(f -> f
                                .circuitBreaker(c -> c.setName(ENCARGADOS_CB)
                                        .setFallbackUri(REPORTING_FALLBACK))
                                .retry(config -> config
                                        .setRetries(1)
                                        .setMethods(HttpMethod.GET)
                                        .setBackoff(Duration.ofMillis(200), Duration.ofSeconds(1), 2, true)))
                        .uri(REPORTING_SERVICE_URI))
                // Real User Monitoring sink: público, alto volumen, sin retries
                // (métrica idempotente pero perder una es aceptable).
                .route("rum-sink", r -> r
                        .path("/api/v1/rum")
                        .filters(f -> f.circuitBreaker(c -> c.setName(RUM_CB)
                                .setFallbackUri(REPORTING_FALLBACK)))
                        .uri(REPORTING_SERVICE_URI))
                .build();
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = corsConfiguration();
        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Accept", "X-XSRF-TOKEN", "Idempotency-Key"));
        config.setExposedHeaders(List.of("ETag", "Location"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }

    CorsConfiguration corsConfiguration() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Accept", "X-XSRF-TOKEN", "Idempotency-Key"));
        config.setExposedHeaders(List.of("ETag", "Location"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        return config;
    }

    /** Marker for the fallback controller in case the enum value is needed. */
    public static HttpStatus circuitOpenStatus() {
        return HttpStatus.SERVICE_UNAVAILABLE;
    }
}
