package com.predicador.reporting.controller;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Locale;

/**
 * Real User Monitoring (RUM) sink for Core Web Vitals reported by the SPA.
 *
 * <p>The browser (see {@code core/services/rum.ts}) captures LCP, INP, CLS,
 * FCP, TTFB through the {@code web-vitals} library and POSTs one metric at a
 * time to this endpoint. Every metric becomes a Micrometer meter tagged by
 * name and route, which Prometheus scrapes from {@code /actuator/prometheus}
 * and Grafana dashboards can slice.</p>
 *
 * <p>Public endpoint on purpose: it must be reachable before login. The
 * validation constraints keep obviously malformed payloads out of the
 * registry so nobody can flood us with a million distinct route tags (which
 * would blow the meter cardinality).</p>
 */
@RestController
@RequestMapping("/api/v1/rum")
public class RumController {

    /** Hard cap on route label length to protect meter cardinality. */
    private static final int MAX_ROUTE_LEN = 40;

    private final MeterRegistry registry;

    public RumController(MeterRegistry registry) {
        this.registry = registry;
    }

    @PostMapping
    public ResponseEntity<Void> ingest(@Valid @RequestBody RumMetric metric) {
        String route = sanitizeRoute(metric.route());
        String name = metric.name().toUpperCase(Locale.ROOT);

        switch (name) {
            case "LCP", "INP", "FCP", "TTFB" -> {
                Timer timer = Timer.builder("web.vitals")
                        .description("Core Web Vitals timing metric (ms)")
                        .tag("metric", name)
                        .tag("route", route)
                        .publishPercentiles(0.5, 0.75, 0.95)
                        .register(registry);
                timer.record(Duration.ofNanos((long) (metric.value() * 1_000_000)));
            }
            case "CLS" -> {
                // CLS is unitless (layout shift score); use a summary.
                DistributionSummary summary = DistributionSummary.builder("web.vitals.cls")
                        .description("Cumulative Layout Shift (unitless)")
                        .tag("route", route)
                        .publishPercentiles(0.5, 0.75, 0.95)
                        .register(registry);
                summary.record(metric.value());
            }
            default -> {
                // Unknown metric names are silently dropped to keep cardinality bounded.
            }
        }

        // 204 No Content: sendBeacon() doesn't inspect the body.
        return ResponseEntity.noContent().build();
    }

    private static String sanitizeRoute(String raw) {
        if (raw == null || raw.isBlank()) return "unknown";
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_ROUTE_LEN) {
            trimmed = trimmed.substring(0, MAX_ROUTE_LEN);
        }
        // Prometheus tag values allow arbitrary UTF-8, but we keep to a safe
        // subset so a hostile client cannot generate unbounded tag values
        // that would explode the meter registry.
        return trimmed.replaceAll("[^a-zA-Z0-9/_\\-]", "_");
    }

    public record RumMetric(
            @NotBlank(message = "name es obligatorio")
            String name,
            @PositiveOrZero(message = "value debe ser >= 0")
            double value,
            String route
    ) {}
}
