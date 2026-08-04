package com.predicador.gateway.config;

import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.TokenValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Reactive session authentication filter for the API gateway.
 *
 * <p>Defense-in-depth: validates HMAC session tokens at the gateway edge
 * before routing to downstream services. Downstream services still enforce
 * their own auth, but this filter catches unauthenticated requests early.</p>
 *
 * <p>Uses {@link TokenValidator} to share validation logic with the
 * servlet-based {@link SessionAuthFilter}.</p>
 */
@Component
public class ReactiveSessionAuthFilter implements WebFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(ReactiveSessionAuthFilter.class);

    private final TokenValidator validator;

    public ReactiveSessionAuthFilter(TokenValidator validator) {
        this.validator = validator;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String method = request.getMethod() != null ? request.getMethod().name() : "GET";
        String path = request.getPath().value();

        // If no rule matches, this is a public endpoint — pass through
        if (validator.findMatchingRule(method, path).isEmpty()) {
            return chain.filter(exchange);
        }

        // Rule matches — validate the token using reactive CookieSource
        TokenValidator.CookieSource cookieSource = new ReactiveCookieSource(request);
        Optional<SessionToken> validated = validator.validate(method, path, cookieSource);
        if (validated.isEmpty()) {
            return reject(exchange);
        }

        SessionToken token = validated.get();
        exchange.getAttributes().put(SessionAuthFilter.ATTR_TOKEN, token);
        exchange.getAttributes().put(SessionAuthFilter.ATTR_SUBJECT, token.subject());
        return chain.filter(exchange);
    }

    private static Mono<Void> reject(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        byte[] body = """
                {"type":"about:blank","title":"No autenticado","status":401,"detail":"Token de sesión ausente o inválido."}
                """.getBytes(StandardCharsets.UTF_8);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body)));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 100; // after CSRF filter, before routing
    }

    /**
     * Adapts a reactive {@link ServerHttpRequest} to the
     * {@link TokenValidator.CookieSource} interface so {@link TokenValidator}
     * can be reused without pulling in Tomcat.
     */
    private record ReactiveCookieSource(ServerHttpRequest request)
            implements TokenValidator.CookieSource {

        @Override
        public String getCookieValue(String name) {
            var cookie = request.getCookies().getFirst(name);
            return cookie != null ? cookie.getValue() : null;
        }

        @Override
        public String getHeaderValue(String name) {
            return request.getHeaders().getFirst(name);
        }
    }
}
