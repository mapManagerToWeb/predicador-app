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
 * <p>Only an explicitly non-strict local configuration may disable enforcement.
 * Strict mode rejects missing or undersized secrets during service construction.</p>
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
    /** HttpOnly cookie used by browser clients for the session token. */
    public static final String SESSION_COOKIE_NAME = "predicador_session";
    /** Legacy service-to-service header; browser clients do not use it. */
    public static final String HEADER_NAME = "X-Session-Token";

    private static final Logger log = LoggerFactory.getLogger(SessionAuthFilter.class);

    private final SessionTokenService tokens;
    private final List<Rule> rules;
    private final boolean allowHeaderAuth;

    public SessionAuthFilter(SessionTokenService tokens, List<Rule> rules) {
        this(tokens, rules, false);
    }

    public SessionAuthFilter(SessionTokenService tokens, List<Rule> rules, boolean allowHeaderAuth) {
        this.tokens = Objects.requireNonNull(tokens, "tokens");
        this.rules = List.copyOf(rules);
        this.allowHeaderAuth = allowHeaderAuth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        if (!tokens.isConfigured() && !tokens.isStrict()) {
            chain.doFilter(req, res);
            return;
        }

        Rule matched = findMatchingRule(req);
        if (matched == null) {
            chain.doFilter(req, res);
            return;
        }

        String cookie = Optional.ofNullable(req.getCookies())
                .stream()
                .flatMap(java.util.Arrays::stream)
                .filter(c -> SESSION_COOKIE_NAME.equals(c.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .findFirst()
                .orElse(null);
        String presented = cookie != null
                ? cookie
                : (allowHeaderAuth ? req.getHeader(HEADER_NAME) : null);
        Optional<SessionToken> parsed = tokens.verify(presented);
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
