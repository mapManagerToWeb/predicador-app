package com.predicador.territory.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.Generated;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

import java.time.Duration;
import java.util.List;

/**
 * In-process Caffeine cache configuration.
 *
 * <p>GeoJSON payloads are expensive to serialize (WKB → coordinate arrays →
 * JSON string builder). They also barely change between requests. Caffeine
 * keeps a tiny bounded LRU per JVM to absorb the traffic peaks the frontend
 * generates when the map viewport pans.</p>
 *
 * <ul>
 *   <li>{@code territoryGeoJsonAll} — full FeatureCollection, invalidated on
 *       color changes so the {@code color} property stays fresh.</li>
 *   <li>{@code territoryGeoJson} — per-territory GeoJSON.</li>
 *   <li>{@code territoryColors} — color map (small but hit on every load).</li>
 *   <li>{@code territoryNumbers} — the list of territory ids (rarely changes).</li>
 * </ul>
 *
 * <p>TTL is intentionally short (10 minutes) so an operator flipping a color
 * from the admin panel sees it reflected without waiting for a redeploy.</p>
 */
@Generated("com.predicador.territory.config.CacheConfig")
@Configuration
@EnableCaching
public class CacheConfig {

    public static final String CACHE_GEOJSON_ALL = "territoryGeoJsonAll";
    public static final String CACHE_GEOJSON_ONE = "territoryGeoJson";
    public static final String CACHE_COLORS = "territoryColors";
    public static final String CACHE_NUMBERS = "territoryNumbers";

    /**
     * Enables strong ETag generation on every GET response of this service.
     * Combined with Caffeine, a client that already holds the current version
     * of a territory GeoJSON gets a 304 Not Modified instead of the full body.
     */
    @Bean
    public FilterRegistrationBean<ShallowEtagHeaderFilter> etagFilter() {
        FilterRegistrationBean<ShallowEtagHeaderFilter> registration =
                new FilterRegistrationBean<>(new ShallowEtagHeaderFilter());
        registration.addUrlPatterns("/api/v1/territories/*");
        registration.setName("etagFilter");
        return registration;
    }

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(10))
                .maximumSize(200)
                .recordStats());
        manager.setCacheNames(List.of(
                CACHE_GEOJSON_ALL,
                CACHE_GEOJSON_ONE,
                CACHE_COLORS,
                CACHE_NUMBERS));
        return manager;
    }
}
