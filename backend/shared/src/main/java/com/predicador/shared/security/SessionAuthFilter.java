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

import jakarta.annotation.Nullable;
import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Servlet filter that enforces {@link SessionToken} presence on protected
 * routes.
 *
 * <p>Delegates rule matching to {@link TokenValidator} for reuse by reactive
 * adapters. Rules are declared per-service via {@link SecurityRule}.</p>
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

    private final TokenValidator validator;
    private final SessionTokenService tokens;

    public SessionAuthFilter(SessionTokenService tokens, List<SecurityRule> rules) {
        this(tokens, rules, false);
    }

    public SessionAuthFilter(SessionTokenService tokens, List<SecurityRule> rules, boolean allowHeaderAuth) {
        this.tokens = tokens;
        this.validator = new TokenValidator(tokens, rules, allowHeaderAuth);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        // La ruta se canonicaliza UNA vez, en el borde: getRequestURI() viene
        // sin decodificar y sin normalizar, mientras que Spring enruta sobre la
        // forma decodificada. Sin esto, %61dmin / // / /./ esquivan las reglas.
        String path;
        try {
            path = RequestPathCanonicalizer.canonicalize(req.getRequestURI());
        } catch (IllegalArgumentException malformed) {
            // No se puede decidir qué ruta es: se rechaza en vez de comparar
            // una ruta que nunca se entendió.
            log.debug("SessionAuthFilter rechazó una ruta ilegible: {}", malformed.getMessage());
            writeProblem(res, HttpStatus.BAD_REQUEST, "Ruta inválida.");
            return;
        }

        // If no rule matches, this is a public endpoint — pass through
        var matchedRule = validator.findMatchingRule(req.getMethod(), path);
        if (matchedRule.isEmpty()) {
            chain.doFilter(req, res);
            return;
        }

        // Rule matches — check if unconfigured
        if (!tokens.isConfigured() && !tokens.isStrict()) {
            chain.doFilter(req, res);
            return;
        }

        // Extract and verify token
        String cookie = extractCookie(req);
        String presented = cookie != null
                ? cookie
                : (validator.isAllowHeaderAuth() ? req.getHeader(HEADER_NAME) : null);
        Optional<SessionToken> parsed = tokens.verify(presented);
        if (parsed.isEmpty()) {
            writeProblem(res, HttpStatus.UNAUTHORIZED, "Token de sesión ausente o inválido.");
            return;
        }

        SessionToken token = parsed.get();
        SecurityRule rule = matchedRule.get();
        if (rule.requiredRole() != null && !token.hasRole(rule.requiredRole())) {
            writeProblem(res, HttpStatus.UNAUTHORIZED, "Permisos insuficientes para este recurso.");
            return;
        }

        req.setAttribute(ATTR_TOKEN, token);
        req.setAttribute(ATTR_SUBJECT, token.subject());
        chain.doFilter(req, res);
    }

    private static String extractCookie(HttpServletRequest req) {
        return Optional.ofNullable(req.getCookies())
                .stream()
                .flatMap(java.util.Arrays::stream)
                .filter(c -> SESSION_COOKIE_NAME.equals(c.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private static void writeProblem(HttpServletResponse res, HttpStatus status, String detail)
            throws IOException {
        res.setStatus(status.value());
        res.setContentType(MediaType.valueOf("application/problem+json").toString());
        res.getWriter().write("""
                {"type":"about:blank","title":"%s","status":%d,"detail":"%s"}
                """.formatted(status == HttpStatus.UNAUTHORIZED ? "No autenticado" : "Solicitud inválida",
                        status.value(), detail.replace("\"", "'")));
        log.debug("SessionAuthFilter rechazó petición: {}", detail);
    }
}
