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
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

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
 * validation constraints and allowlists keep malformed or hostile payloads
 * out of the registry so nobody can flood us with unbounded cardin ality.</p>
 */
@RestController
@RequestMapping("/api/v1/rum")
public class RumController {

    /** Hard cap on route label length to protect meter cardinality. */
    private static final int MAX_ROUTE_LEN = 40;

    /** Maximum allowed body size in bytes (1 KB — a single metric is ~100 bytes). */
    static final int MAX_BODY_BYTES = 1024;

    /**
     * Explicit allowlist of accepted metric names.
     * Unknown names are silently dropped — no meter is created.
     */
    static final Set<String> ALLOWED_METRICS = Set.of("LCP", "INP", "CLS", "FCP", "TTFB");

    /**
     * Known frontend routes for route allowlist.
     * Unrecognized routes collapse to "unknown" to bound cardinality.
     */
    static final Set<String> ALLOWED_ROUTES = Set.of(
            "/", "/map", "/login", "/profile", "/admin",
            "/territories/:id", "/territories/:id/color",
            "/reports/:id", "/unknown"
    );

    /**
     * Maximum sane value per metric (ms for timing, unitless for CLS).
     * Values above this are capped to prevent one rogue client from
     * skewing percentiles for everyone.
     */
    private static final double MAX_LCP_MS = 60_000;
    private static final double MAX_INP_MS = 10_000;
    private static final double MAX_FCP_MS = 30_000;
    private static final double MAX_TTFB_MS = 30_000;
    private static final double MAX_CLS = 5.0;

    private final MeterRegistry registry;

    /** Cached meters keyed by "metric" and "metric|route" to avoid re-registering per request. */
    private final ConcurrentHashMap<String, Timer> timers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, DistributionSummary> summaries = new ConcurrentHashMap<>();

    public RumController(MeterRegistry registry) {
        this.registry = registry;
    }

    @PostMapping
    public ResponseEntity<Void> ingest(@Valid @RequestBody RumMetric metric) {
        // 1. Validate metric name is in allowlist (defense-in-depth, validation already does this)
        String name = metric.name().toUpperCase(Locale.ROOT);
        if (!ALLOWED_METRICS.contains(name)) {
            return ResponseEntity.noContent().build();
        }

        // 2. Validate value is finite (not NaN, not Infinity)
        if (!Double.isFinite(metric.value())) {
            return ResponseEntity.badRequest().build();
        }

        // 3. Validate value is positive
        if (metric.value() < 0) {
            return ResponseEntity.badRequest().build();
        }

        // 4. Cap values to prevent percentile skewing
        double cappedValue = capMetricValue(name, metric.value());

        // 5. Sanitize and allowlist route
        String route = sanitizeRoute(metric.route());

        // 6. Record metric
        switch (name) {
            case "LCP", "INP", "FCP", "TTFB" -> {
                Timer timer = timers.computeIfAbsent(name + "|" + route, key -> Timer.builder("web.vitals")
                        .description("Core Web Vitals timing metric (ms)")
                        .tag("metric", name)
                        .tag("route", route)
                        .publishPercentiles(0.5, 0.75, 0.95)
                        .register(registry));
                timer.record(Duration.ofNanos((long) (cappedValue * 1_000_000)));
            }
            case "CLS" -> {
                DistributionSummary summary = summaries.computeIfAbsent(route, key -> DistributionSummary.builder("web.vitals.cls")
                        .description("Cumulative Layout Shift (unitless)")
                        .tag("route", route)
                        .publishPercentiles(0.5, 0.75, 0.95)
                        .register(registry));
                summary.record(cappedValue);
            }
            default -> {
                // Should never reach here due to allowlist check above.
            }
        }

        return ResponseEntity.noContent().build();
    }

    static double capMetricValue(String name, double value) {
        return switch (name) {
            case "LCP" -> Math.min(value, MAX_LCP_MS);
            case "INP" -> Math.min(value, MAX_INP_MS);
            case "FCP" -> Math.min(value, MAX_FCP_MS);
            case "TTFB" -> Math.min(value, MAX_TTFB_MS);
            case "CLS" -> Math.min(value, MAX_CLS);
            default -> value;
        };
    }

    static String sanitizeRoute(String raw) {
        if (raw == null || raw.isBlank()) return "unknown";
        String trimmed = raw.trim();
        if (trimmed.length() > MAX_ROUTE_LEN) {
            trimmed = trimmed.substring(0, MAX_ROUTE_LEN);
        }
        // Sanitize dangerous characters
        String sanitized = trimmed.replaceAll("[^a-zA-Z0-9/_\\-]", "_");
        // Collapse dynamic segments: /territories/123 → /territories/:id
        sanitized = sanitized.replaceAll("/\\d+(?=/|$)", "/:id");
        // Allowlist check: if not in known routes, collapse to "unknown"
        if (!isAllowedRoute(sanitized)) {
            return "unknown";
        }
        return sanitized;
    }

    private static boolean isAllowedRoute(String route) {
        return ALLOWED_ROUTES.contains(route);
    }

    public record RumMetric(
            @NotBlank(message = "name es obligatorio")
            String name,
            @PositiveOrZero(message = "value debe ser >= 0")
            double value,
            String route
    ) {}
}
