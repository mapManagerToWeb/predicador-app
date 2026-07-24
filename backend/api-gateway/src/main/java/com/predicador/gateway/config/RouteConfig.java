package com.predicador.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class RouteConfig {

    @Value("${app.cors.allowed-origins:http://localhost:4200}")
    private String allowedOrigins;

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("territory-colors", r -> r
                        .path("/api/v1/territories/colors")
                        .filters(f -> f.stripPrefix(0)
                                .setResponseHeader(HttpHeaders.CACHE_CONTROL, "max-age=600"))
                        .uri("http://territory-service:8081"))
                .route("territory-geojson-all", r -> r
                        .path("/api/v1/territories/all/geojson")
                        .filters(f -> f.stripPrefix(0)
                                .setResponseHeader(HttpHeaders.CACHE_CONTROL, "max-age=300"))
                        .uri("http://territory-service:8081"))
                .route("territory-service", r -> r
                        .path("/api/v1/territories/**")
                        .filters(f -> f.stripPrefix(0))
                        .uri("http://territory-service:8081"))
                .route("reporting-service", r -> r
                        .path("/api/v1/reports/**")
                        .filters(f -> f.stripPrefix(0))
                        .uri("http://reporting-service:8082"))
                .route("encargados-service", r -> r
                        .path("/api/v1/encargados/**")
                        .filters(f -> f.stripPrefix(0))
                        .uri("http://reporting-service:8082"))
                .build();
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }
}
