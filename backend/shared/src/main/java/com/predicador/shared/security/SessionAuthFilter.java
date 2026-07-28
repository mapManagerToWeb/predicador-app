package com.predicador.shared.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Servlet filter that enforces {@link SessionToken} presence on protected
 * routes.
 *
 * <p>Rules are declared per-service via {@link Rule}. A rule matches when the
 * request method is in the rule's allowed set AND the URI path matches the
 * rule's regex. Non-matching requests pass through unchanged (public
 * endpoints); matching requests without a valid token get {@code 401}.</p>
 *
 * <p><strong>Soft rollout:</strong> if {@link SessionTokenService#isConfigured()}
 * returns {@code false} (empty {@code app.session.secret}), the filter
 * disables itself completely. This lets us ship the enforcement code before
 * setting the secret in production, and roll back by clearing the env var if
 * needed. Deployment order becomes: (1) release with filter installed, (2)
 * set secret env, (3) verify logs, (4) hard-fail if secret disappears.</p>
 *
 * <p>The extracted subject is attached to the request via {@link #ATTR_SUBJECT}
 * so downstream controllers can inspect the authenticated principal without
 * re-parsing the token.</p>
 */
public class SessionAuthFilter extends OncePerRequestFilter {

    /** Request attribute holding the validated {@link SessionToken}. */
    public static final String ATTR_TOKEN = "predicador.session.token";
    /** Request attribute shortcut for {@code token.subject()}. */
    public static final String ATTR_SUBJECT = "predicador.session.subject";
    /** Request header the client MUST send with the token value. */
    public static final String HEADER_NAME = "X-Session-Token";

    private static final Logger log = LoggerFactory.getLogger(SessionAuthFilter.class);

    private final SessionTokenService tokens;
    private final List<Rule> rules;

    public SessionAuthFilter(SessionTokenService tokens, List<Rule> rules) {
        this.tokens = Objects.requireNonNull(tokens, "tokens");
        this.rules = List.copyOf(rules);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        // Fail-open when tokens are not configured yet. Warned only once at
        // startup by the config class that builds this filter; do not spam
        // the logs here per-request.
        if (!tokens.isConfigured()) {
            chain.doFilter(req, res);
            return;
        }

        Rule matched = findMatchingRule(req);
        if (matched == null) {
            chain.doFilter(req, res);
            return;
        }

        String header = req.getHeader(HEADER_NAME);
        Optional<SessionToken> parsed = tokens.verify(header);
        if (parsed.isEmpty()) {
            writeUnauthorized(res, "Token de sesión ausente o inválido.");
            return;
        }

        SessionToken token = parsed.get();
        if (matched.requiredRole != null && !token.hasRole(matched.requiredRole)) {
            writeUnauthorized(res, "Permisos insuficientes para este recurso.");
            return;
        }

        req.setAttribute(ATTR_TOKEN, token);
        req.setAttribute(ATTR_SUBJECT, token.subject());
        chain.doFilter(req, res);
    }

    private Rule findMatchingRule(HttpServletRequest req) {
        String method = req.getMethod();
        String path = req.getRequestURI();
        for (Rule rule : rules) {
            if (!rule.methods.contains(method)) continue;
            if (rule.pattern.matcher(path).matches()) return rule;
        }
        return null;
    }

    private static void writeUnauthorized(HttpServletResponse res, String detail) throws IOException {
        res.setStatus(HttpStatus.UNAUTHORIZED.value());
        res.setContentType(MediaType.valueOf("application/problem+json").toString());
        res.getWriter().write("""
                {"type":"about:blank","title":"No autenticado","status":401,"detail":"%s"}
                """.formatted(detail.replace("\"", "'")));
        log.debug("SessionAuthFilter rechazó petición: {}", detail);
    }

    /**
     * Rule = (HTTP methods, path regex, required role).
     *
     * @param methods       HTTP verbs the rule applies to. Empty set = no match.
     * @param pattern       regex matched against {@code request.getRequestURI()}.
     * @param requiredRole  role the token must carry, or {@code null} to accept
     *                      any authenticated principal.
     */
    public record Rule(List<String> methods, Pattern pattern, String requiredRole) {

        public Rule {
            Objects.requireNonNull(methods, "methods");
            Objects.requireNonNull(pattern, "pattern");
            methods = List.copyOf(methods);
        }

        public static Rule of(String method, String regex, String requiredRole) {
            return new Rule(List.of(method), Pattern.compile(regex), requiredRole);
        }

        public static Rule any(List<String> methods, String regex, String requiredRole) {
            return new Rule(methods, Pattern.compile(regex), requiredRole);
        }
    }
}
