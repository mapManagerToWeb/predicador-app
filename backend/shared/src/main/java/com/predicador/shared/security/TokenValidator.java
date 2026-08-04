package com.predicador.shared.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Stateless token validator that decouples HMAC verification from the
 * servlet filter. Extracted so both servlet ({@link SessionAuthFilter})
 * and reactive (gateway WebFilter) adapters can share the same logic.
 */
public class TokenValidator {

    private final SessionTokenService tokens;
    private final List<SessionAuthFilter.Rule> rules;
    private final boolean allowHeaderAuth;

    public TokenValidator(SessionTokenService tokens, List<SessionAuthFilter.Rule> rules) {
        this(tokens, rules, false);
    }

    public TokenValidator(SessionTokenService tokens, List<SessionAuthFilter.Rule> rules,
                          boolean allowHeaderAuth) {
        this.tokens = Objects.requireNonNull(tokens, "tokens");
        this.rules = List.copyOf(rules);
        this.allowHeaderAuth = allowHeaderAuth;
    }

    public boolean isAllowHeaderAuth() {
        return allowHeaderAuth;
    }

    /**
     * Find a matching rule for the given method and path.
     * Returns {@code Optional.empty()} if no rule matches (public endpoint).
     */
    public Optional<SessionAuthFilter.Rule> findMatchingRule(String method, String path) {
        for (SessionAuthFilter.Rule rule : rules) {
            if (!rule.methods().contains(method)) continue;
            if (rule.pattern().matcher(path).matches()) return Optional.of(rule);
        }
        return Optional.empty();
    }

    /**
     * Validate a servlet request. Extracts token from cookie (or header
     * if allowed), verifies HMAC, checks route rules and role requirements.
     *
     * <p>Returns {@code Optional.empty()} when no rule matches (public endpoint)
     * or when the token is invalid/missing. Use {@link #findMatchingRule} to
     * distinguish these cases.</p>
     */
    public Optional<SessionToken> validate(HttpServletRequest req) {
        if (!tokens.isConfigured() && !tokens.isStrict()) {
            return Optional.empty();
        }

        SessionAuthFilter.Rule matched = findMatchingRule(req.getMethod(), req.getRequestURI()).orElse(null);
        if (matched == null) {
            return Optional.empty();
        }

        String presented = extractTokenFromServlet(req);
        Optional<SessionToken> parsed = tokens.verify(presented);
        if (parsed.isEmpty()) {
            return Optional.empty();
        }

        SessionToken token = parsed.get();
        if (matched.requiredRole() != null && !token.hasRole(matched.requiredRole())) {
            return Optional.empty();
        }

        return Optional.of(token);
    }

    /**
     * Validate with explicit method, path, and cookie source. Useful for
     * reactive adapters that don't have a servlet request.
     */
    public Optional<SessionToken> validate(String method, String path, CookieSource cookieSource) {
        if (!tokens.isConfigured() && !tokens.isStrict()) {
            return Optional.empty();
        }

        SessionAuthFilter.Rule matched = findMatchingRule(method, path).orElse(null);
        if (matched == null) {
            return Optional.empty();
        }

        String presented = extractToken(cookieSource);
        Optional<SessionToken> parsed = tokens.verify(presented);
        if (parsed.isEmpty()) {
            return Optional.empty();
        }

        SessionToken token = parsed.get();
        if (matched.requiredRole() != null && !token.hasRole(matched.requiredRole())) {
            return Optional.empty();
        }

        return Optional.of(token);
    }

    private String extractTokenFromServlet(HttpServletRequest req) {
        String cookie = Optional.ofNullable(req.getCookies())
                .stream()
                .flatMap(java.util.Arrays::stream)
                .filter(c -> SessionAuthFilter.SESSION_COOKIE_NAME.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
        return cookie != null
                ? cookie
                : (allowHeaderAuth ? req.getHeader(SessionAuthFilter.HEADER_NAME) : null);
    }

    private String extractToken(CookieSource cookieSource) {
        String cookie = cookieSource.getCookieValue(SessionAuthFilter.SESSION_COOKIE_NAME);
        return cookie != null
                ? cookie
                : (allowHeaderAuth ? cookieSource.getHeaderValue(SessionAuthFilter.HEADER_NAME) : null);
    }

    /**
     * Abstraction for reading cookies and headers from either servlet or
     * reactive requests.
     */
    public interface CookieSource {
        String getCookieValue(String name);
        String getHeaderValue(String name);
    }
}
