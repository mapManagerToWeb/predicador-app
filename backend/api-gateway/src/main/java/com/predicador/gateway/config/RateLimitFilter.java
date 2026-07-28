package com.predicador.gateway.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

/**
 * Rate-limits sensitive endpoints on a per-IP basis using Bucket4j.
 *
 * <p>In-memory only (per gateway instance). Sufficient for single-node
 * deployments; a distributed backend (Redis) is out of scope until we scale
 * horizontally.</p>
 *
 * <p>Two policies are applied:</p>
 * <ul>
 *   <li>Auth endpoints ({@code /api/v1/auth/login}, {@code /api/v1/encargados/login}):
 *       6 requests / minute — prevents brute-force of passwords and phone numbers.</li>
 *   <li>Encargados creation ({@code POST /api/v1/encargados}, {@code /encargados/buscar-crear}):
 *       20 / minute — light throttling so a script cannot spam-register.</li>
 * </ul>
 *
 * <p>Buckets are keyed by client IP. Storage is backed by Caffeine with a
 * bounded capacity + TTL so a rotating-IP attacker cannot force the map to
 * grow without limit (DoS-by-memory). Entries eviction happens naturally
 * because a purged IP simply gets a fresh full bucket on next hit, which is
 * safe: the attacker can never gain from being forgotten.</p>
 *
 * <p>When the reverse proxy sits in front, {@code X-Forwarded-For} takes
 * precedence over the socket address so the real client IP wins.</p>
 */
@Component
public class RateLimitFilter implements WebFilter, Ordered {

    private static final MediaType PROBLEM_JSON = MediaType.valueOf("application/problem+json");

    /** Upper bound on unique IPs tracked per policy. ~1 MiB total in memory. */
    private static final int MAX_BUCKETS = 20_000;
    /** How long an idle bucket lives before being evicted. */
    private static final Duration BUCKET_TTL = Duration.ofMinutes(15);

    private static final Bandwidth AUTH_LIMIT = Bandwidth.builder()
            .capacity(6)
            .refillGreedy(6, Duration.ofMinutes(1))
            .build();

    private static final Bandwidth REGISTER_LIMIT = Bandwidth.builder()
            .capacity(20)
            .refillGreedy(20, Duration.ofMinutes(1))
            .build();

    private final Cache<String, Bucket> authBuckets = Caffeine.newBuilder()
            .maximumSize(MAX_BUCKETS)
            .expireAfterAccess(BUCKET_TTL)
            .build();

    private final Cache<String, Bucket> registerBuckets = Caffeine.newBuilder()
            .maximumSize(MAX_BUCKETS)
            .expireAfterAccess(BUCKET_TTL)
            .build();

    private final List<Rule> rules = List.of(
            new Rule("POST", "/api/v1/auth/login", ip -> bucket(authBuckets, ip, AUTH_LIMIT)),
            new Rule("POST", "/api/v1/encargados/login", ip -> bucket(authBuckets, ip, AUTH_LIMIT)),
            new Rule("POST", "/api/v1/encargados", ip -> bucket(registerBuckets, ip, REGISTER_LIMIT)),
            new Rule("POST", "/api/v1/encargados/buscar-crear",
                    ip -> bucket(registerBuckets, ip, REGISTER_LIMIT))
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String method = exchange.getRequest().getMethod().name();
        String path = exchange.getRequest().getPath().value();

        Rule matched = null;
        for (Rule rule : rules) {
            if (rule.method.equals(method) && rule.path.equals(path)) {
                matched = rule;
                break;
            }
        }
        if (matched == null) {
            return chain.filter(exchange);
        }

        String ip = clientIp(exchange);
        Bucket bucket = matched.bucketFor.apply(ip);
        if (bucket.tryConsume(1)) {
            return chain.filter(exchange);
        }

        return tooManyRequests(exchange);
    }

    private static String clientIp(ServerWebExchange exchange) {
        List<String> forwarded = exchange.getRequest().getHeaders().get("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty()) {
            String first = forwarded.get(0);
            int comma = first.indexOf(',');
            String ip = (comma > 0 ? first.substring(0, comma) : first).trim();
            if (!ip.isEmpty()) {
                return ip;
            }
        }
        InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
        return remote != null && remote.getAddress() != null
                ? remote.getAddress().getHostAddress()
                : "unknown";
    }

    private static Bucket bucket(Cache<String, Bucket> store, String key, Bandwidth limit) {
        return store.get(Objects.requireNonNullElse(key, "unknown"),
                k -> Bucket.builder().addLimit(limit).build());
    }

    private static Mono<Void> tooManyRequests(ServerWebExchange exchange) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS);
        pd.setTitle("Demasiadas solicitudes");
        pd.setDetail("Alcanzaste el límite de intentos. Intentá de nuevo en un minuto.");
        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        exchange.getResponse().getHeaders().setContentType(PROBLEM_JSON);
        exchange.getResponse().getHeaders().set("Retry-After", "60");
        byte[] body = ("""
                {"type":"about:blank","title":"%s","status":429,"detail":"%s"}
                """.formatted(pd.getTitle(), pd.getDetail())).getBytes(StandardCharsets.UTF_8);
        return exchange.getResponse().writeWith(Mono.just(
                exchange.getResponse().bufferFactory().wrap(body)));
    }

    @Override
    public int getOrder() {
        // Run before routing so we short-circuit before hitting the downstream.
        return Ordered.HIGHEST_PRECEDENCE + 100;
    }

    private record Rule(String method, String path, Function<String, Bucket> bucketFor) {}
}
