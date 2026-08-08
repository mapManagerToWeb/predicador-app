# Architecture Deepening: Candidates 1–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shared security contract, unify auth rules, split ReportController, and deepen MapSelectionService.

**Architecture:** Four independent refactors that share one dependency chain: Candidate 1 (SecurityRule extraction) must land before Candidate 2 (auth rule deduplication). Candidates 3 and 4 are independent of each other and of 1–2 but should be sequenced after them to avoid merge conflicts.

**Tech Stack:** Java 25, Spring Boot 4.0, Spring MVC/WebFlux, Angular 22, TypeScript, Vitest, Leaflet

## Global Constraints

- Java 25 LTS, Spring Boot 4.0.0, Spring Cloud 2025.1.0
- Angular 22 SSR/PWA, Node 22, pnpm via Corepack
- PostgreSQL + PostGIS (shared by territory-service, reporting-service)
- Maven reactor: `mvn verify -B` from `backend/`
- Frontend: `pnpm test -- --run` from `predicador-frontend/`
- ESLint: no floating promises, no explicit any
- Vitest + jsdom, co-located `.spec.ts`, `@analogjs/vitest-angular`
- No generated artifacts as source: `target/`, `dist/`, `coverage/` ignored

---

## File Structure

### Candidate 1: Extract SecurityRule

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/shared/src/main/java/com/predicador/shared/security/SecurityRule.java` | Top-level record, replaces inner `SessionAuthFilter.Rule` |
| Create | `backend/shared/src/main/java/com/predicador/shared/security/SecurityConstants.java` | `ATTR_TOKEN`, `ATTR_SUBJECT`, `SESSION_COOKIE_NAME`, `HEADER_NAME` constants |
| Create | `backend/shared/src/main/java/com/predicador/shared/security/SecurityContext.java` | Typed holder replacing stringly-typed `request.getAttribute()` |
| Modify | `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java` | Delegate to `SecurityRule`, keep inner `Rule` as deprecated alias |
| Modify | `backend/shared/src/main/java/com/predicador/shared/security/TokenValidator.java` | Consume `SecurityRule` instead of `SessionAuthFilter.Rule` |
| Modify | `backend/api-gateway/src/main/java/com/predicador/gateway/config/ReactiveSessionAuthFilter.java` | Import `SecurityConstants` + `SecurityContext` |
| Modify | `backend/territory-service/src/main/java/com/predicador/territory/config/SecurityConfig.java` | Import `SecurityRule` |
| Modify | `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java` | Import `SecurityRule` |
| Modify | `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java` | Use `SecurityContext` |
| Modify | `backend/reporting-service/src/main/java/com/predicador/reporting/controller/EncargadoController.java` | Use `SecurityContext` |
| Create | `backend/shared/src/test/java/com/predicador/shared/security/SecurityRuleTest.java` | Tests for extracted rule |
| Create | `backend/shared/src/test/java/com/predicador/shared/security/SecurityContextTest.java` | Tests for typed holder |
| Modify | `backend/shared/src/test/java/com/predicador/shared/security/TokenValidatorTest.java` | Update imports |
| Modify | `backend/shared/src/test/java/com/predicador/shared/security/SessionAuthFilterTest.java` | Update imports |

### Candidate 2: Unify Auth Rules

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/shared/src/main/java/com/predicador/shared/security/SecurityRules.java` | Centralized rule definitions |
| Modify | `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java` | Read from `SecurityRules` |
| Modify | `backend/territory-service/src/main/java/com/predicador/territory/config/SecurityConfig.java` | Read from `SecurityRules` |
| Modify | `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java` | Read from `SecurityRules` |
| Create | `backend/shared/src/test/java/com/predicador/shared/security/SecurityRulesTest.java` | Verify single source of truth |

### Candidate 3: Split ReportController

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/reporting-service/src/main/java/com/predicador/reporting/controller/WhatsAppController.java` | WhatsApp endpoints |
| Modify | `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java` | Remove WhatsApp endpoints |
| Create | `backend/reporting-service/src/test/java/com/predicador/reporting/controller/WhatsAppControllerTest.java` | Tests for new controller |
| Modify | `backend/reporting-service/src/test/java/com/predicador/reporting/controller/ReportControllerSendTest.java` | Remove WhatsApp send tests |

### Candidate 4: Deepen MapSelectionService

| Action | File | Purpose |
|--------|------|---------|
| Create | `predicador-frontend/src/app/features/map/services/map-mark-restoration.service.ts` | Restoration logic extraction |
| Modify | `predicador-frontend/src/app/features/map/services/map-selection.service.ts` | Remove restoration methods |
| Create | `predicador-frontend/src/app/features/map/services/map-mark-restoration.service.spec.ts` | Tests for restoration |
| Modify | `predicador-frontend/src/app/features/map/services/map-selection.service.spec.ts` | Remove restoration tests |

---

## Task 1: Create SecurityRule record and SecurityConstants

**Files:**
- Create: `backend/shared/src/main/java/com/predicador/shared/security/SecurityRule.java`
- Create: `backend/shared/src/main/java/com/predicador/shared/security/SecurityConstants.java`
- Test: `backend/shared/src/test/java/com/predicador/shared/security/SecurityRuleTest.java`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `SecurityRule` record with `methods()`, `pattern()`, `requiredRole()`, `of()`, `any()` factory methods. `SecurityConstants` with `ATTR_TOKEN`, `ATTR_SUBJECT`, `SESSION_COOKIE_NAME`, `HEADER_NAME` constants.

- [ ] **Step 1: Write the failing test for SecurityRule**

```java
package com.predicador.shared.security;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SecurityRuleTest {

    @Test
    void of_createsRuleWithSingleMethod() {
        var rule = SecurityRule.of("POST", "^/api/v1/reports$", null);

        assertEquals(List.of("POST"), rule.methods());
        assertTrue(rule.pattern().matcher("/api/v1/reports").matches());
        assertNull(rule.requiredRole());
    }

    @Test
    void any_createsRuleWithMultipleMethods() {
        var rule = SecurityRule.any(List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null);

        assertEquals(2, rule.methods().size());
        assertTrue(rule.methods().contains("GET"));
        assertTrue(rule.methods().contains("POST"));
    }

    @Test
    void requiredRole_isPreserved() {
        var rule = SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", "admin");

        assertEquals("admin", rule.requiredRole());
    }

    @Test
    void methods_areImmutableCopy() {
        var rule = SecurityRule.of("POST", "^/api/v1/reports$", null);

        assertThrows(UnsupportedOperationException.class,
                () -> rule.methods().add("DELETE"));
    }

    @Test
    void of_rejectsNullMethod() {
        assertThrows(NullPointerException.class,
                () -> SecurityRule.of(null, "^/api/v1/reports$", null));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl shared test -Dtest=SecurityRuleTest -B`
Expected: FAIL with "cannot find symbol: class SecurityRule"

- [ ] **Step 3: Write minimal implementation**

```java
package com.predicador.shared.security;

import jakarta.annotation.Nullable;

import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Authentication rule that pairs HTTP methods with a path regex and an
 * optional required role. This is the shared security contract consumed
 * by all services (gateway, territory, reporting).
 *
 * @param methods       HTTP verbs the rule applies to. Empty set = no match.
 * @param pattern       regex matched against {@code request.getRequestURI()}.
 * @param requiredRole  role the token must carry, or {@code null} to accept
 *                      any authenticated principal.
 */
public record SecurityRule(List<String> methods, Pattern pattern, @Nullable String requiredRole) {

    public SecurityRule {
        Objects.requireNonNull(methods, "methods");
        Objects.requireNonNull(pattern, "pattern");
        methods = List.copyOf(methods);
    }

    public static SecurityRule of(String method, String regex, @Nullable String requiredRole) {
        return new SecurityRule(List.of(method), Pattern.compile(regex), requiredRole);
    }

    public static SecurityRule any(List<String> methods, String regex, @Nullable String requiredRole) {
        return new SecurityRule(methods, Pattern.compile(regex), requiredRole);
    }
}
```

```java
package com.predicador.shared.security;

/**
 * Centralized constants for session security attributes.
 * Replaces scattered string literals across modules.
 */
public final class SecurityConstants {

    private SecurityConstants() {}

    /** Request attribute holding the validated {@link SessionToken}. */
    public static final String ATTR_TOKEN = "predicador.session.token";
    /** Request attribute shortcut for {@code token.subject()}. */
    public static final String ATTR_SUBJECT = "predicador.session.subject";
    /** HttpOnly cookie used by browser clients for the session token. */
    public static final String SESSION_COOKIE_NAME = "predicador_session";
    /** Legacy service-to-service header; browser clients do not use it. */
    public static final String HEADER_NAME = "X-Session-Token";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl shared test -Dtest=SecurityRuleTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/SecurityRule.java \
        backend/shared/src/main/java/com/predicador/shared/security/SecurityConstants.java \
        backend/shared/src/test/java/com/predicador/shared/security/SecurityRuleTest.java
git commit -m "feat(shared): extract SecurityRule and SecurityConstants from SessionAuthFilter"
```

---

## Task 2: Create SecurityContext typed holder

**Files:**
- Create: `backend/shared/src/main/java/com/predicador/shared/security/SecurityContext.java`
- Test: `backend/shared/src/test/java/com/predicador/shared/security/SecurityContextTest.java`

**Interfaces:**
- Consumes: `SessionToken`, `SecurityConstants`
- Produces: `SecurityContext` with `getToken()`, `setToken()`, `getSubject()` static methods

- [ ] **Step 1: Write the failing test**

```java
package com.predicador.shared.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SecurityContextTest {

    @Test
    void getToken_returnsTokenSetOnCurrentThread() {
        SessionToken token = new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        SecurityContext.setToken(token);

        try {
            assertEquals(token, SecurityContext.getToken());
            assertEquals("42", SecurityContext.getSubject());
        } finally {
            SecurityContext.clear();
        }
    }

    @Test
    void clear_removesToken() {
        SecurityContext.setToken(new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L));
        SecurityContext.clear();

        assertNull(SecurityContext.getToken());
        assertNull(SecurityContext.getSubject());
    }

    @Test
    void getToken_returnsNullWhenNotSet() {
        SecurityContext.clear();
        assertNull(SecurityContext.getToken());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl shared test -Dtest=SecurityContextTest -B`
Expected: FAIL with "cannot find symbol: class SecurityContext"

- [ ] **Step 3: Write minimal implementation**

```java
package com.predicador.shared.security;

/**
 * Thread-local holder for the authenticated {@link SessionToken}.
 * Replaces the stringly-typed {@code request.getAttribute()} pattern
 * with a typed accessor.
 */
public final class SecurityContext {

    private static final ThreadLocal<SessionToken> HOLDER = new ThreadLocal<>();

    private SecurityContext() {}

    public static void setToken(SessionToken token) {
        HOLDER.set(token);
    }

    public static SessionToken getToken() {
        return HOLDER.get();
    }

    public static String getSubject() {
        SessionToken token = getToken();
        return token != null ? token.subject() : null;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl shared test -Dtest=SecurityContextTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/SecurityContext.java \
        backend/shared/src/test/java/com/predicador/shared/security/SecurityContextTest.java
git commit -m "feat(shared): add SecurityContext typed holder"
```

---

## Task 3: Update TokenValidator to consume SecurityRule

**Files:**
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/TokenValidator.java:15-16,37-42,49-78`
- Modify: `backend/shared/src/test/java/com/predicador/shared/security/TokenValidatorTest.java`

**Interfaces:**
- Consumes: `SecurityRule`, `SecurityConstants`
- Produces: `TokenValidator` now accepts `List<SecurityRule>` instead of `List<SessionAuthFilter.Rule>`

- [ ] **Step 1: Write the failing test (update existing)**

Replace the `TokenValidatorTest` to use `SecurityRule` instead of `SessionAuthFilter.Rule`:

```java
package com.predicador.shared.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TokenValidatorTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private TokenValidator validator;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        validator = new TokenValidator(tokens, List.of(
                SecurityRule.of("POST", "^/api/v1/reports$", null),
                SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        ));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_returnsSessionToken() {
        var cookie = new SimpleCookieSource(SecurityConstants.SESSION_COOKIE_NAME, encargadoToken, null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isPresent());
        assertEquals("42", result.get().subject());
    }

    @Test
    void missingToken_returnsEmpty() {
        var cookie = new SimpleCookieSource(null, null, null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void invalidToken_returnsEmpty() {
        var cookie = new SimpleCookieSource(SecurityConstants.SESSION_COOKIE_NAME, "garbage", null);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void roleMismatch_returnsEmpty() {
        var cookie = new SimpleCookieSource(SecurityConstants.SESSION_COOKIE_NAME, encargadoToken, null);
        var result = validator.validate("PUT", "/api/v1/territories/5/color", cookie);

        assertTrue(result.isEmpty());
    }

    @Test
    void nonMatchingRoute_returnsEmpty() {
        var result = validator.validate("GET", "/api/v1/territories",
                new SimpleCookieSource(null, null, null));

        assertTrue(result.isEmpty());
    }

    @Test
    void headerAuth_whenAllowed_usesHeader() {
        TokenValidator headerValidator = new TokenValidator(tokens, List.of(
                SecurityRule.of("POST", "^/api/v1/reports$", null)
        ), true);
        var cookie = new SimpleCookieSource(null, null, encargadoToken);

        var result = headerValidator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isPresent());
    }

    @Test
    void headerAuth_whenNotAllowed_ignoresHeader() {
        var cookie = new SimpleCookieSource(null, null, encargadoToken);
        var result = validator.validate("POST", "/api/v1/reports", cookie);

        assertTrue(result.isEmpty());
    }

    private record SimpleCookieSource(String cookieName, String cookieValue, String headerValue)
            implements TokenValidator.CookieSource {

        @Override
        public String getCookieValue(String name) {
            return cookieName != null && cookieName.equals(name) ? cookieValue : null;
        }

        @Override
        public String getHeaderValue(String name) {
            return headerValue;
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl shared test -Dtest=TokenValidatorTest -B`
Expected: FAIL — `TokenValidator` constructor still expects `List<SessionAuthFilter.Rule>`

- [ ] **Step 3: Update TokenValidator to consume SecurityRule**

```java
package com.predicador.shared.security;

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
    private final List<SecurityRule> rules;
    private final boolean allowHeaderAuth;

    public TokenValidator(SessionTokenService tokens, List<SecurityRule> rules) {
        this(tokens, rules, false);
    }

    public TokenValidator(SessionTokenService tokens, List<SecurityRule> rules,
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
    public Optional<SecurityRule> findMatchingRule(String method, String path) {
        for (SecurityRule rule : rules) {
            if (!rule.methods().contains(method)) continue;
            if (rule.pattern().matcher(path).matches()) return Optional.of(rule);
        }
        return Optional.empty();
    }

    /**
     * Validate with explicit method, path, and cookie source. Useful for
     * reactive adapters that don't have a servlet request.
     */
    public Optional<SessionToken> validate(String method, String path, CookieSource cookieSource) {
        if (!tokens.isConfigured() && !tokens.isStrict()) {
            return Optional.empty();
        }

        SecurityRule matched = findMatchingRule(method, path).orElse(null);
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

    private String extractToken(CookieSource cookieSource) {
        String cookie = cookieSource.getCookieValue(SecurityConstants.SESSION_COOKIE_NAME);
        return cookie != null
                ? cookie
                : (allowHeaderAuth ? cookieSource.getHeaderValue(SecurityConstants.HEADER_NAME) : null);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl shared test -Dtest=TokenValidatorTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/TokenValidator.java \
        backend/shared/src/test/java/com/predicador/shared/security/TokenValidatorTest.java
git commit -m "refactor(shared): TokenValidator consumes SecurityRule instead of SessionAuthFilter.Rule"
```

---

## Task 4: Update SessionAuthFilter to delegate to SecurityRule

**Files:**
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java`
- Modify: `backend/shared/src/test/java/com/predicador/shared/security/SessionAuthFilterTest.java`

**Interfaces:**
- Consumes: `SecurityRule`, `SecurityConstants`
- Produces: `SessionAuthFilter` delegates to `SecurityRule`, inner `Rule` kept as deprecated alias

- [ ] **Step 1: Write the failing test**

The existing `SessionAuthFilterTest` already uses `SessionAuthFilter.Rule`. After the refactor, it should still pass since we keep the inner class as a deprecated alias. Let's add a new test that uses `SecurityRule` directly:

```java
// Add to existing SessionAuthFilterTest.java:
@Test
void filter_worksWithSecurityRule_directly() {
    var tokens = new SessionTokenService("test-secret-with-plenty-of-entropy", 1);
    var rule = SecurityRule.of("POST", "^/api/v1/reports$", null);
    var filter = new SessionAuthFilter(tokens, List.of(rule));

    // Verify the filter accepts SecurityRule via the new constructor
    assertNotNull(filter);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl shared test -Dtest=SessionAuthFilterTest -B`
Expected: FAIL — constructor doesn't accept `SecurityRule` yet

- [ ] **Step 3: Update SessionAuthFilter**

```java
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
import java.util.Optional;

/**
 * Servlet filter that enforces {@link SessionToken} presence on protected
 * routes.
 *
 * <p>Delegates rule matching to {@link TokenValidator} for reuse by reactive
 * adapters. Rules are declared per-service via {@link SecurityRule}.</p>
 */
public class SessionAuthFilter extends OncePerRequestFilter {

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
        var matchedRule = validator.findMatchingRule(req.getMethod(), req.getRequestURI());
        if (matchedRule.isEmpty()) {
            chain.doFilter(req, res);
            return;
        }

        if (!tokens.isConfigured() && !tokens.isStrict()) {
            chain.doFilter(req, res);
            return;
        }

        String cookie = extractCookie(req);
        String presented = cookie != null
                ? cookie
                : (validator.isAllowHeaderAuth() ? req.getHeader(SecurityConstants.HEADER_NAME) : null);
        Optional<SessionToken> parsed = tokens.verify(presented);
        if (parsed.isEmpty()) {
            writeUnauthorized(res, "Token de sesión ausente o inválido.");
            return;
        }

        SessionToken token = parsed.get();
        SecurityRule rule = matchedRule.get();
        if (rule.requiredRole() != null && !token.hasRole(rule.requiredRole())) {
            writeUnauthorized(res, "Permisos insuficientes para este recurso.");
            return;
        }

        req.setAttribute(SecurityConstants.ATTR_TOKEN, token);
        req.setAttribute(SecurityConstants.ATTR_SUBJECT, token.subject());
        chain.doFilter(req, res);
    }

    private static String extractCookie(HttpServletRequest req) {
        return Optional.ofNullable(req.getCookies())
                .stream()
                .flatMap(java.util.Arrays::stream)
                .filter(c -> SecurityConstants.SESSION_COOKIE_NAME.equals(c.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .findFirst()
                .orElse(null);
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
     * @deprecated Use {@link SecurityRule} directly.
     */
    @Deprecated
    public static class Rule extends SecurityRule {
        public Rule(List<String> methods, java.util.regex.Pattern pattern, String requiredRole) {
            super(methods, pattern, requiredRole);
        }

        public static Rule of(String method, String regex, String requiredRole) {
            return new Rule(List.of(method), java.util.regex.Pattern.compile(regex), requiredRole);
        }

        public static Rule any(List<String> methods, String regex, String requiredRole) {
            return new Rule(methods, java.util.regex.Pattern.compile(regex), requiredRole);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl shared test -Dtest=SessionAuthFilterTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java \
        backend/shared/src/test/java/com/predicador/shared/security/SessionAuthFilterTest.java
git commit -m "refactor(shared): SessionAuthFilter delegates to SecurityRule, keep Rule as deprecated alias"
```

---

## Task 5: Update gateway, territory, and reporting imports

**Files:**
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/ReactiveSessionAuthFilter.java:3,5,62-63`
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java:3-4,48-55`
- Modify: `backend/territory-service/src/main/java/com/predicador/territory/config/SecurityConfig.java:3-4,35-38`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java:3-4,42-56`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java:13-14,133-135`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/EncargadoController.java:6-7,169-171`

**Interfaces:**
- Consumes: `SecurityRule`, `SecurityConstants`, `SecurityContext`
- Produces: All consumers import from `shared.security.SecurityRule` and `SecurityConstants` instead of `SessionAuthFilter`

- [ ] **Step 1: Update ReactiveSessionAuthFilter**

Change imports from:
```java
import com.predicador.shared.security.SessionAuthFilter;
```
to:
```java
import com.predicador.shared.security.SecurityConstants;
```

Change lines 62-63 from:
```java
exchange.getAttributes().put(SessionAuthFilter.ATTR_TOKEN, token);
exchange.getAttributes().put(SessionAuthFilter.ATTR_SUBJECT, token.subject());
```
to:
```java
exchange.getAttributes().put(SecurityConstants.ATTR_TOKEN, token);
exchange.getAttributes().put(SecurityConstants.ATTR_SUBJECT, token.subject());
```

- [ ] **Step 2: Update RouteConfig**

Change imports from:
```java
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionAuthFilter.Rule;
```
to:
```java
import com.predicador.shared.security.SecurityRule;
```

Change line 48 from `List<Rule>` to `List<SecurityRule>` and line 55 from `return new TokenValidator(tokens, rules)` (unchanged, but types flow through).

- [ ] **Step 3: Update territory SecurityConfig**

Change imports from:
```java
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionAuthFilter.Rule;
```
to:
```java
import com.predicador.shared.security.SecurityRule;
```

Change line 35 from `List<Rule>` to `List<SecurityRule>`, and line 41 `new SessionAuthFilter(tokens, rules)` — this still works because `SessionAuthFilter` now accepts `List<SecurityRule>`.

- [ ] **Step 4: Update reporting SecurityConfig**

Same pattern as territory — replace `Rule` import with `SecurityRule`, update type on line 42.

- [ ] **Step 5: Update ReportController**

Change imports:
```java
import com.predicador.shared.security.SessionAuthFilter;
```
to:
```java
import com.predicador.shared.security.SecurityConstants;
```

Change line 134 from:
```java
return (SessionToken) request.getAttribute(SessionAuthFilter.ATTR_TOKEN);
```
to:
```java
return (SessionToken) request.getAttribute(SecurityConstants.ATTR_TOKEN);
```

- [ ] **Step 6: Update EncargadoController**

Same pattern — replace `SessionAuthFilter.ATTR_TOKEN` with `SecurityConstants.ATTR_TOKEN`.

- [ ] **Step 7: Run all shared, gateway, territory, and reporting tests**

Run: `mvn verify -B -pl shared,api-gateway,territory-service,reporting-service`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "refactor: migrate all consumers from SessionAuthFilter inner types to SecurityRule/SecurityConstants"
```

---

## Task 6: Create SecurityRules centralized registry

**Files:**
- Create: `backend/shared/src/main/java/com/predicador/shared/security/SecurityRules.java`
- Create: `backend/shared/src/test/java/com/predicador/shared/security/SecurityRulesTest.java`

**Interfaces:**
- Consumes: `SecurityRule`, `SessionToken`
- Produces: `SecurityRules.GATEWAY`, `SecurityRules.TERRITORY`, `SecurityRules.REPORTING` — shared rule lists

- [ ] **Step 1: Write the failing test**

```java
package com.predicador.shared.security;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SecurityRulesTest {

    @Test
    void gateway_rules_matchExpectedEndpoints() {
        List<SecurityRule> rules = SecurityRules.GATEWAY;

        // POST /reports should match
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("POST") &&
                r.pattern().matcher("/api/v1/reports").matches()));

        // PUT /territories/5/color with admin role should match
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("PUT") &&
                r.requiredRole() != null &&
                r.pattern().matcher("/api/v1/territories/5/color").matches()));
    }

    @Test
    void territory_rules_matchExpectedEndpoints() {
        List<SecurityRule> rules = SecurityRules.TERRITORY;

        // PUT /territories/5/color with admin role
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("PUT") &&
                r.requiredRole() != null &&
                r.pattern().matcher("/api/v1/territories/5/color").matches()));
    }

    @Test
    void reporting_rules_matchExpectedEndpoints() {
        List<SecurityRule> rules = SecurityRules.REPORTING;

        // GET /reports should match
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("GET") &&
                r.pattern().matcher("/api/v1/reports").matches()));

        // POST /reports should match
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("POST") &&
                r.pattern().matcher("/api/v1/reports").matches()));

        // GET /encargados should match
        assertTrue(rules.stream().anyMatch(r ->
                r.methods().contains("GET") &&
                r.pattern().matcher("/api/v1/encargados").matches()));
    }

    @Test
    void gateway_and_territory_shareAdminColorRule() {
        // Both gateway and territory define the same admin color rule
        SecurityRule gatewayColor = SecurityRules.GATEWAY.stream()
                .filter(r -> r.pattern().matcher("/api/v1/territories/5/color").matches())
                .findFirst().orElseThrow();
        SecurityRule territoryColor = SecurityRules.TERRITORY.stream()
                .filter(r -> r.pattern().matcher("/api/v1/territories/5/color").matches())
                .findFirst().orElseThrow();

        assertEquals(gatewayColor.requiredRole(), territoryColor.requiredRole());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl shared test -Dtest=SecurityRulesTest -B`
Expected: FAIL with "cannot find symbol: class SecurityRules"

- [ ] **Step 3: Write minimal implementation**

```java
package com.predicador.shared.security;

import java.util.List;

/**
 * Single source of truth for auth rules shared across gateway and
 * downstream services. Each service reads the list it needs from here
 * instead of defining its own overlapping rules.
 */
public final class SecurityRules {

    private SecurityRules() {}

    /**
     * Gateway-level rules. The gateway enforces these at the edge
     * (defense-in-depth). Downstream services still enforce their own.
     */
    public static final List<SecurityRule> GATEWAY = List.of(
            SecurityRule.of("POST", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("DELETE", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null)
    );

    /**
     * Territory-service rules. Only color mutation requires admin auth;
     * territory data is public.
     */
    public static final List<SecurityRule> TERRITORY = List.of(
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN)
    );

    /**
     * Reporting-service rules. Reports and encargado queries/mutations
     * require authentication. Login/registration endpoints are excluded.
     */
    public static final List<SecurityRule> REPORTING = List.of(
            SecurityRule.any(List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/?$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/buscar$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/session$", null)
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl shared test -Dtest=SecurityRulesTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/SecurityRules.java \
        backend/shared/src/test/java/com/predicador/shared/security/SecurityRulesTest.java
git commit -m "feat(shared): add SecurityRules centralized auth rule registry"
```

---

## Task 7: Wire SecurityRules into gateway and services

**Files:**
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java:47-56`
- Modify: `backend/territory-service/src/main/java/com/predicador/territory/config/SecurityConfig.java:29-46`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java:36-64`

**Interfaces:**
- Consumes: `SecurityRules.GATEWAY`, `SecurityRules.TERRITORY`, `SecurityRules.REPORTING`
- Produces: Gateway `tokenValidator` bean reads from `SecurityRules.GATEWAY`; services read from their respective lists

- [ ] **Step 1: Update RouteConfig.tokenValidator()**

```java
@Bean
public TokenValidator tokenValidator(SessionTokenService tokens) {
    return new TokenValidator(tokens, SecurityRules.GATEWAY);
}
```

Remove the inline `List<Rule>` construction.

- [ ] **Step 2: Update territory SecurityConfig**

```java
@Bean
public FilterRegistrationBean<SessionAuthFilter> sessionAuthFilter(SessionTokenService tokens) {
    if (!tokens.isConfigured()) {
        log.warn("SESSION_SECRET no configurado: SessionAuthFilter arranca en modo compatibilidad "
                + "(no aplica enforcement). Configurar app.session.secret en producción.");
    }

    FilterRegistrationBean<SessionAuthFilter> reg = new FilterRegistrationBean<>(
            new SessionAuthFilter(tokens, SecurityRules.TERRITORY));
    reg.setName("sessionAuthFilter");
    reg.setOrder(-100);
    reg.addUrlPatterns("/api/v1/*");
    return reg;
}
```

- [ ] **Step 3: Update reporting SecurityConfig**

```java
@Bean
public FilterRegistrationBean<SessionAuthFilter> sessionAuthFilter(SessionTokenService tokens) {
    if (!tokens.isConfigured()) {
        log.warn("SESSION_SECRET no configurado: SessionAuthFilter arranca en modo compatibilidad "
                + "(no aplica enforcement). Configurar app.session.secret en producción.");
    }

    FilterRegistrationBean<SessionAuthFilter> reg = new FilterRegistrationBean<>(
            new SessionAuthFilter(tokens, SecurityRules.REPORTING));
    reg.setName("sessionAuthFilter");
    reg.setOrder(-100);
    reg.addUrlPatterns("/api/v1/*");
    return reg;
}
```

- [ ] **Step 4: Run full backend verification**

Run: `mvn verify -B`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "refactor: wire SecurityRules centralized registry into gateway and services"
```

---

## Task 8: Create WhatsAppController

**Files:**
- Create: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/WhatsAppController.java`
- Create: `backend/reporting-service/src/test/java/com/predicador/reporting/controller/WhatsAppControllerTest.java`

**Interfaces:**
- Consumes: `WhatsAppSendService`, `WhatsAppSendPublisher`, `AuthorizationService`, `SecurityConstants`
- Produces: `WhatsAppController` with `POST /send`, `GET /send/{key}`, `POST /whatsapp/async`

- [ ] **Step 1: Write the failing test**

```java
package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.reporting.publisher.WhatsAppSendPublisher;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class WhatsAppControllerTest {

    private MockMvc mockMvc;

    @Mock
    private WhatsAppSendService whatsAppSendService;

    @Mock
    private WhatsAppSendPublisher whatsAppSendPublisher;

    private WhatsAppController controller;

    private final SessionToken owner = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);

    @BeforeEach
    void setUp() {
        controller = new WhatsAppController(whatsAppSendService, whatsAppSendPublisher, new AuthorizationService());
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private static final String PAYLOAD = """
        {
          "encargadoNombre": "Daniel",
          "encargadoApellido": "Uribe",
          "fechaRegistro": "21-07-2026",
          "territorios": [
            {"numero": 1, "finalizado": true, "totalManzanas": 12, "manzanasMarcadas": 12}
          ],
          "screenshotBase64": null,
          "destinationNumber": null
        }
        """;

    @Test
    void sendWhatsAppReport_returns202AcceptedWhileInProgress() throws Exception {
        when(whatsAppSendService.submit(any(WhatsAppSendRequest.class), isNull()))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "IN_PROGRESS", null, null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SecurityConstants.ATTR_TOKEN, owner)
                .content(PAYLOAD))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }

    @Test
    void sendWhatsAppReport_completedKey_replays200() throws Exception {
        when(whatsAppSendService.submit(any(WhatsAppSendRequest.class), isNull()))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "SUCCEEDED", "msg_123", null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SecurityConstants.ATTR_TOKEN, owner)
                .content(PAYLOAD))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUCCEEDED"))
            .andExpect(jsonPath("$.messageId").value("msg_123"));
    }

    @Test
    void sendWhatsAppReport_withoutToken_shouldReturn403ProblemDetail() throws Exception {
        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content(PAYLOAD))
            .andExpect(status().isForbidden());
    }

    @Test
    void getSendStatus_returnsCurrentStatus() throws Exception {
        when(whatsAppSendService.getStatus("key-1"))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "FAILED", null, "Meta rejected"));

        mockMvc.perform(get("/api/v1/reports/send/key-1")
                .requestAttr(SecurityConstants.ATTR_TOKEN, owner))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("FAILED"))
            .andExpect(jsonPath("$.error").value("Meta rejected"));
    }

    @Test
    void sendWhatsAppAsync_returns202Accepted() throws Exception {
        mockMvc.perform(post("/api/v1/reports/whatsapp/async")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SecurityConstants.ATTR_TOKEN, owner)
                .header("Idempotency-Key", "async-key-1")
                .content("{}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -pl reporting-service test -Dtest=WhatsAppControllerTest -B`
Expected: FAIL with "cannot find symbol: class WhatsAppController"

- [ ] **Step 3: Write minimal implementation**

```java
package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.publisher.WhatsAppSendPublisher;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/reports")
public class WhatsAppController {

    private final WhatsAppSendService whatsAppSendService;
    private final WhatsAppSendPublisher whatsAppSendPublisher;
    private final AuthorizationService authorization;

    public WhatsAppController(WhatsAppSendService whatsAppSendService,
                              WhatsAppSendPublisher whatsAppSendPublisher,
                              AuthorizationService authorization) {
        this.whatsAppSendService = whatsAppSendService;
        this.whatsAppSendPublisher = whatsAppSendPublisher;
        this.authorization = authorization;
    }

    @PostMapping("/send")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppReport(
            @Valid @RequestBody WhatsAppSendRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        WhatsAppDeliveryDto delivery = whatsAppSendService.submit(request, idempotencyKey);
        if (WhatsAppDeliveryStatus.IN_PROGRESS.name().equals(delivery.status())) {
            return ResponseEntity.accepted().body(delivery);
        }
        return ResponseEntity.ok(delivery);
    }

    @GetMapping("/send/{idempotencyKey}")
    public ResponseEntity<WhatsAppDeliveryDto> getSendStatus(
            @PathVariable String idempotencyKey, HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));
        return ResponseEntity.ok(whatsAppSendService.getStatus(idempotencyKey));
    }

    @PostMapping("/whatsapp/async")
    public ResponseEntity<WhatsAppDeliveryDto> sendWhatsAppAsync(
            @Valid @RequestBody WhatsAppMessageRequest request,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            HttpServletRequest httpRequest) {
        authorization.requireAuthenticated(token(httpRequest));

        whatsAppSendPublisher.publish(request);

        return ResponseEntity.accepted()
                .body(new WhatsAppDeliveryDto(
                        idempotencyKey,
                        WhatsAppDeliveryStatus.IN_PROGRESS.name(),
                        null,
                        null));
    }

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SecurityConstants.ATTR_TOKEN);
    }

    @ExceptionHandler(WhatsAppIntegrationException.class)
    ResponseEntity<ProblemDetail> handleWhatsAppFailure(WhatsAppIntegrationException exception) {
        HttpStatus status = HttpStatus.resolve(exception.status());
        if (status == null || status.is2xxSuccessful()) status = HttpStatus.BAD_GATEWAY;
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
        problem.setTitle("Fallo en la integración WhatsApp");
        problem.setType(URI.create("https://api.predicador.com/errors/whatsapp-integration"));
        return ResponseEntity.status(status).body(problem);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -pl reporting-service test -Dtest=WhatsAppControllerTest -B`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/reporting-service/src/main/java/com/predicador/reporting/controller/WhatsAppController.java \
        backend/reporting-service/src/test/java/com/predicador/reporting/controller/WhatsAppControllerTest.java
git commit -m "feat(reporting): extract WhatsAppController from ReportController"
```

---

## Task 9: Strip WhatsApp endpoints from ReportController

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java`
- Modify: `backend/reporting-service/src/test/java/com/predicador/reporting/controller/ReportControllerSendTest.java`

**Interfaces:**
- Consumes: `ReportService`, `AuthorizationService`
- Produces: `ReportController` with only CRUD endpoints (create, getAll, today, batch)

- [ ] **Step 1: Rewrite ReportController without WhatsApp**

```java
package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.net.URI;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;
    private final AuthorizationService authorization;

    public ReportController(ReportService reportService, AuthorizationService authorization) {
        this.reportService = reportService;
        this.authorization = authorization;
    }

    @PostMapping
    public ResponseEntity<?> createReports(
            @RequestBody @Valid List<@Valid ReportDto> dtos, HttpServletRequest request) {
        if (dtos == null || dtos.isEmpty()) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "La lista de reportes no puede estar vacía");
            problem.setTitle("Datos inválidos");
            problem.setType(URI.create("https://api.predicador.com/errors/bad-request"));
            return ResponseEntity.badRequest().body(problem);
        }
        return ResponseEntity.ok(reportService.createReports(dtos, token(request)));
    }

    @GetMapping
    public ResponseEntity<List<ReportDto>> getAllReports(
            @RequestParam(required = false) Long territorioNumero,
            @RequestParam(required = false) Long encargadoId, HttpServletRequest request) {
        var pageable = PageRequest.of(boundedPage(request.getParameter("page")),
                boundedSize(request.getParameter("size")), Sort.by(Sort.Direction.DESC, "fecha")
                        .and(Sort.by(Sort.Direction.DESC, "id")));
        if (territorioNumero != null) {
            return ResponseEntity.ok(reportService.getReportsByTerritorio(territorioNumero, pageable, token(request)).getContent());
        }
        if (encargadoId != null) {
            return ResponseEntity.ok(reportService.getReportsByEncargado(encargadoId, pageable, token(request)).getContent());
        }
        return ResponseEntity.ok(reportService.getAllReports(pageable, token(request)).getContent());
    }

    @GetMapping("/today")
    public ResponseEntity<List<ReportDto>> getTodayReports(HttpServletRequest request) {
        var pageable = PageRequest.of(boundedPage(request.getParameter("page")),
                boundedSize(request.getParameter("size")), Sort.by(Sort.Direction.DESC, "fecha")
                        .and(Sort.by(Sort.Direction.DESC, "id")));
        return ResponseEntity.ok(reportService.getReportsForToday(pageable, token(request)).getContent());
    }

    @GetMapping("/batch")
    public ResponseEntity<Map<Long, List<ReportDto>>> getReportsBatch(
            @RequestParam List<Long> territorios, HttpServletRequest request) {
        if (territorios.size() > ReportService.MAX_BATCH_SIZE) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(reportService.getReportsByMultipleTerritorios(territorios, token(request)));
    }

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SecurityConstants.ATTR_TOKEN);
    }

    private int boundedPage(String value) {
        if (value == null) return 0;
        int page = Integer.parseInt(value);
        if (page < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page no puede ser negativo");
        return page;
    }

    private int boundedSize(String value) {
        if (value == null) return 50;
        int size = Integer.parseInt(value);
        if (size < 1 || size > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "size debe estar entre 1 y 100");
        }
        return size;
    }
}
```

- [ ] **Step 2: Update ReportControllerTest to remove WhatsApp send tests**

The existing `ReportControllerSendTest` tests WhatsApp endpoints that now live in `WhatsAppController`. Remove `ReportControllerSendTest.java` (its coverage is now in `WhatsAppControllerTest`). The remaining `ReportControllerTest` covers CRUD only.

- [ ] **Step 3: Run reporting-service tests**

Run: `mvn -pl reporting-service test -B`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/reporting-service/
git commit -m "refactor(reporting): strip WhatsApp endpoints from ReportController"
```

---

## Task 10: Create MapMarkRestorationService

**Files:**
- Create: `predicador-frontend/src/app/features/map/services/map-mark-restoration.service.ts`
- Create: `predicador-frontend/src/app/features/map/services/map-mark-restoration.service.spec.ts`

**Interfaces:**
- Consumes: `MapStateService`, `MapRenderingFacade`, `MapLayerRegistry`, `TerritorioService`, `Toast`
- Produces: `MapMarkRestorationService` with `restaurarDesdeDB()`, `restaurarConReportes()`, `restaurarGeometriaParcial()`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';

function fakePath() {
  return { setStyle: vi.fn(), getLatLngs: vi.fn(() => []) };
}

describe('MapMarkRestorationService', () => {
  let service: MapMarkRestorationService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let rendering: ReturnType<typeof createRenderingMock>;
  let territorioService: ReturnType<typeof createTerritorioMock>;
  let toast: ReturnType<typeof createToastMock>;

  function createRenderingMock() {
    return {
      getManzanaIndex: vi.fn().mockReturnValue([{ territorioNumero: 1, id: 'm1', nombreBloque: 'A', polygon: fakePath() }]),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      applyBaseTerritoryStyle: vi.fn(),
      getMap: vi.fn().mockReturnValue(null),
      addExtraLayer: vi.fn(),
      removeExtraLayer: vi.fn(),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#fff'),
    };
  }

  function createTerritorioMock() {
    return { getReportesPorTerritorio: vi.fn() };
  }

  function createToastMock() {
    return { show: vi.fn() };
  }

  beforeEach(() => {
    rendering = createRenderingMock();
    territorioService = createTerritorioMock();
    toast = createToastMock();
    TestBed.configureTestingModule({
      providers: [
        MapMarkRestorationService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        MapLayerRegistry,
        { provide: TerritorioService, useValue: territorioService },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapMarkRestorationService);
    state = TestBed.inject(MapStateService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  describe('restaurarDesdeDB', () => {
    it('restores marks from the last report', async () => {
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getManzanaIndex.mockReturnValue([
        { territorioNumero: 1, id: 'm1', nombreBloque: 'A', polygon: fakePath() },
        { territorioNumero: 1, id: 'm2', nombreBloque: 'B', polygon: fakePath() },
      ]);
      territorioService.getReportesPorTerritorio.mockResolvedValue([
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null },
      ]);

      await service.restaurarDesdeDB(1);

      expect(rendering.applyBaseTerritoryStyle).toHaveBeenCalled();
      expect(state.manzanasMarcadas().map(m => m.id)).toEqual(['m1']);
      expect(registry.get('m1')).not.toBeNull();
    });

    it('shows a toast when the reports cannot be loaded', async () => {
      territorioService.getReportesPorTerritorio.mockRejectedValue(new Error('boom'));

      await service.restaurarDesdeDB(1);

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('restaurar'));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd predicador-frontend && pnpm test -- src/app/features/map/services/map-mark-restoration.service.spec.ts --run`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import { getMarkedManzanaStyle, getPartialPolygonCompleteStyle } from './map-style.service';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapMarkRestorationService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);

  async restaurarDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    try {
      const reportes = await this.territorioService.getReportesPorTerritorio(territorioNumero);
      this.restaurarConReportes(territorioNumero, reportes, colorOverride, options);
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  restaurarConReportes(
    territorioNumero: number,
    reportes: Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    try {
      const featureLayerColor = this.rendering
        .getAllTerritoriesLayer()
        .find(f => f.territorioPadre === territorioNumero)?.color;
      const color = colorOverride ?? featureLayerColor ?? this.rendering.getCurrentTerritoryColor();
      const { actualizarEstadoMarcado = true } = options;

      if (actualizarEstadoMarcado) {
        const previosParciales = this.state.manzanasMarcadas()
          .filter(m => m.territorioNumero === territorioNumero && m.id.startsWith('parcial-'));
        for (const p of previosParciales) {
          const layer = this.registry.get(p.id);
          if (layer) this.rendering.removeExtraLayer(layer);
          this.registry.unregister(p.id);
        }
        if (previosParciales.length > 0) {
          this.state.manzanasMarcadas.update(current =>
            current.filter(m => !(m.territorioNumero === territorioNumero && m.id.startsWith('parcial-')))
          );
        }
      }

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      const total = this.rendering.getManzanaIndex().filter(mc => mc.territorioNumero === territorioNumero).length;
      const marcadas = ids.length;
      const isComplete = total > 0 && marcadas >= total;

      this.rendering.applyBaseTerritoryStyle(territorioNumero, color, marcadas, { total, isComplete });

      if (!reportes.length || !ultimo) return;

      const manzanaId = ultimo.manzanaId ? String(ultimo.manzanaId) : null;
      const existingIds = new Set(
        this.state.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).map(m => m.id)
      );

      for (const mc of this.rendering.getManzanaIndex()) {
        if (mc.territorioNumero !== territorioNumero) continue;
        const isMarked = ids.includes(mc.id) || (manzanaId !== null && mc.id === manzanaId);
        if (isMarked) {
          mc.polygon.setStyle(getMarkedManzanaStyle(color));
          if (actualizarEstadoMarcado && !existingIds.has(mc.id)) {
            this.registry.register(mc.id, mc.polygon);
            this.state.manzanasMarcadas.update(current => [
              ...current,
              { id: mc.id, nombreBloque: mc.nombreBloque, color, territorioNumero },
            ]);
          }
        }
      }

      if (ultimo.geometriaParcial) {
        this.restaurarGeometriaParcial(ultimo.geometriaParcial, color, territorioNumero, actualizarEstadoMarcado);
      }
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  private restaurarGeometriaParcial(
    geometriaParcial: string,
    color: string,
    territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    const map = this.rendering.getMap();
    if (!map) return;

    try {
      const geometry = JSON.parse(geometriaParcial) as GeoJSON.Geometry;
      let latlngs: L.LatLngExpression[] = [];

      if (geometry.type === 'Polygon') {
        latlngs = (geometry as GeoJSON.Polygon).coordinates[0].map(c => L.latLng(c[1], c[0]));
      } else if (geometry.type === 'MultiPolygon') {
        latlngs = (geometry as GeoJSON.MultiPolygon).coordinates[0][0].map(c => L.latLng(c[1], c[0]));
      }

      if (latlngs.length === 0) return;

      const parcialId = nextParcialId();
      const polygon = L.polygon(latlngs, getPartialPolygonCompleteStyle(color)).addTo(map);

      this.rendering.addExtraLayer(polygon);

      if (actualizarEstadoMarcado) {
        this.registry.register(parcialId, polygon);
        this.state.manzanasMarcadas.update(current => [
          ...current,
          { id: parcialId, nombreBloque: 'Zona parcial', color, territorioNumero },
        ]);
      }
    } catch {
      /* ignore parse errors */
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd predicador-frontend && pnpm test -- src/app/features/map/services/map-mark-restoration.service.spec.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-mark-restoration.service.ts \
        predicador-frontend/src/app/features/map/services/map-mark-restoration.service.spec.ts
git commit -m "feat(map): extract MapMarkRestorationService from MapSelectionService"
```

---

## Task 11: Wire MapMarkRestorationService into MapSelectionService

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-selection.service.ts`
- Modify: `predicador-frontend/src/app/features/map/services/map-selection.service.spec.ts`

**Interfaces:**
- Consumes: `MapMarkRestorationService`
- Produces: `MapSelectionService` delegates restoration to `MapMarkRestorationService`

- [ ] **Step 1: Update MapSelectionService**

Remove `restaurarMarcadoDesdeDB`, `restaurarMarcadoConReportes`, and `restaurarGeometriaParcial` methods. Inject `MapMarkRestorationService` and delegate:

```typescript
import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES } from '../utils/map-constants';
import {
  getBaseTerritoryStyle,
  getMarkedManzanaStyle,
  getSelectedManzanaStyle,
} from './map-style.service';
import type { ModoMarcado } from '../types/map.types';

@Injectable({ providedIn: 'root' })
export class MapSelectionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly restoration = inject(MapMarkRestorationService);
  private readonly toastService = inject(Toast);

  private selectedPolygon: L.Polygon | null = null;

  // seleccionarManzana, restaurarManzanaAnterior, toggleManzana,
  // calcularCompletitudTerritorio, desmarcarManzana, marcarManzana,
  // prepareTerritorioSeleccionado, updateTotalManzanas stay here

  // Restoration methods delegate to MapMarkRestorationService:
  async restaurarMarcadoDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    return this.restoration.restaurarDesdeDB(territorioNumero, colorOverride, options);
  }

  restaurarMarcadoConReportes(
    territorioNumero: number,
    reportes: import('../../../core/models/models').Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    this.restoration.restaurarConReportes(territorioNumero, reportes, colorOverride, options);
  }

  // setModoMarcado, limpiarMarcas, reaplicarMarcasSeleccionadas,
  // resetUIState, limpiarParcial stay here
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd predicador-frontend && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-selection.service.ts \
        predicador-frontend/src/app/features/map/services/map-selection.service.spec.ts
git commit -m "refactor(map): MapSelectionService delegates restoration to MapMarkRestorationService"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run full backend verification**

Run: `mvn verify -B`
Expected: ALL PASS

- [ ] **Step 2: Run full frontend verification**

Run: `cd predicador-frontend && pnpm run lint && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Run production build**

Run: `cd predicador-frontend && pnpm ng build --configuration=production`
Expected: BUILD SUCCESS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify architecture deepening candidates 1-4"
```

---

## Plan Complete

Plan saved to `docs/superpowers/plans/2026-08-04-architecture-deepening-1-4.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
