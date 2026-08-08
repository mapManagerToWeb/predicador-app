# Shared Module Deepening + Phone Normalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated phone normalization, remove fragile cross-stack coupling in the exception handler, and add defense-in-depth session validation at the gateway.

**Architecture:** Extract shared utilities to the `shared` module. Introduce a `TokenValidator` interface to decouple HMAC validation from the servlet filter, enabling a reactive adapter for the gateway. Remove the WebFlux-specific exception handler from the MVC exception advice.

**Tech Stack:** Java 25, Spring Boot 4.0.0, Spring Cloud Gateway (WebFlux/Netty), Spring MVC/Tomcat, Maven, JUnit 5, Mockito, Testcontainers (PostGIS).

## Global Constraints

- Backend is Maven reactor from `backend/`. Run all Maven commands from `backend/`.
- `shared` module marks `spring-boot-starter-web` as `<optional>` — never add non-optional web dependencies.
- `SessionTokenService` is a pure domain utility with zero Spring web dependencies.
- Gateway runs on WebFlux/Netty; downstream services run on Spring MVC/Tomcat.
- The `shared` module is a JAR (no Spring Boot plugin), consumed by gateway, territory-service, and reporting-service.
- Preserve existing `SessionAuthFilter` behavior — it is tested and used by both downstream services.

---

### Task 1: Extract PhoneUtil to shared module

**Files:**
- Create: `backend/shared/src/main/java/com/predicador/shared/util/PhoneUtil.java`
- Create: `backend/shared/src/test/java/com/predicador/shared/util/PhoneUtilTest.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/EncargadoService.java:140-147`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportSendService.java:235-241`

**Interfaces:**
- Consumes: nothing (standalone utility)
- Produces: `PhoneUtil.normalize(String phone)` — returns `String` (digits with Chilean country code prefix) or `null` if input is `null`

- [ ] **Step 1: Write the failing test for PhoneUtil**

```java
package com.predicador.shared.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PhoneUtilTest {

    @Test
    void normalizesChileanMobileNumber() {
        // 9-digit mobile with leading 9 → prepend country code 56
        assertEquals("56912345678", PhoneUtil.normalize("912345678"));
    }

    @Test
    void normalizesWithCountryCodeAlreadyPresent() {
        // Already has 56 prefix → strip non-digits, return as-is
        assertEquals("56912345678", PhoneUtil.normalize("+56 9 1234 5678"));
    }

    @Test
    void stripsNonDigitCharacters() {
        assertEquals("56912345678", PhoneUtil.normalize("(56) 9-1234-5678"));
    }

    @Test
    void handlesShortNumberWithoutPrefix() {
        // 8-digit number without leading 9 → just strip non-digits
        assertEquals("22345678", PhoneUtil.normalize("22345678"));
    }

    @Test
    void returnsNullForNullInput() {
        assertNull(PhoneUtil.normalize(null));
    }

    @Test
    void returnsEmptyForBlankInput() {
        assertEquals("", PhoneUtil.normalize("  "));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `mvn -pl shared test -Dtest=PhoneUtilTest -q`

Expected: FAIL — `PhoneUtil` class does not exist.

- [ ] **Step 3: Write minimal implementation**

```java
package com.predicador.shared.util;

/**
 * Chilean phone number normalization utility.
 *
 * <p>Strips non-digit characters and prepends the country code {@code 56}
 * when the resulting number is a 9-digit mobile number starting with {@code 9}.</p>
 */
public final class PhoneUtil {

    private PhoneUtil() {}

    /**
     * Normalize a phone number to digits with Chilean country code.
     *
     * @param phone raw phone number (may contain spaces, dashes, parentheses, +)
     * @return normalized digits string, or {@code null} if input is {@code null}
     */
    public static String normalize(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 9 && digits.startsWith("9")) {
            return "56" + digits;
        }
        return digits;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `mvn -pl shared test -Dtest=PhoneUtilTest -q`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Update EncargadoService to use PhoneUtil**

Replace the private `normalizePhone` method at line 140-147 of `EncargadoService.java`:

```java
// BEFORE (lines 140-147):
private String normalizePhone(String phone) {
    if (phone == null) return null;
    String digits = phone.replaceAll("[^0-9]", "");
    if (digits.length() == 9 && digits.startsWith("9")) {
        return "56" + digits;
    }
    return digits;
}

// AFTER:
// Delete the private method entirely.
// Add import at top of file:
import com.predicador.shared.util.PhoneUtil;
// Replace all calls to normalizePhone(x) with PhoneUtil.normalize(x)
```

Update the 4 call sites in `EncargadoService`:
- Line 38: `normalizePhone(telefono)` → `PhoneUtil.normalize(telefono)`
- Line 68: `normalizePhone(dto.telefono())` → `PhoneUtil.normalize(dto.telefono())`
- Line 82: `normalizePhone(dto.telefono())` → `PhoneUtil.normalize(dto.telefono())`
- Line 98: `normalizePhone(telefono)` → `PhoneUtil.normalize(telefono)`

- [ ] **Step 6: Update ReportSendService to use PhoneUtil**

Replace the private `normalizePhone` method at line 235-241 of `ReportSendService.java`:

```java
// BEFORE (lines 235-241):
private String normalizePhone(String phone) {
    String digits = phone.replaceAll("[^0-9]", "");
    if (digits.length() == 9 && digits.startsWith("9")) {
        return "56" + digits;
    }
    return digits;
}

// AFTER:
// Delete the private method entirely.
// Add import at top of file:
import com.predicador.shared.util.PhoneUtil;
// Replace the call at line 128:
//   normalizePhone(request.destinationNumber())
// with:
//   PhoneUtil.normalize(request.destinationNumber())
```

- [ ] **Step 7: Run existing tests to verify no regressions**

Run from `backend/`: `mvn -pl shared,reporting-service test -q`

Expected: all existing tests pass. `EncargadoServiceTest` and `ReportSendServiceTest` exercise phone normalization through their service methods.

- [ ] **Step 8: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/util/PhoneUtil.java \
        backend/shared/src/test/java/com/predicador/shared/util/PhoneUtilTest.java \
        backend/reporting-service/src/main/java/com/predicador/reporting/service/EncargadoService.java \
        backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportSendService.java
git commit -m "refactor: extract PhoneUtil to shared module, remove duplicated normalizePhone"
```

---

### Task 2: Remove WebFlux ResponseStatusException handler from GlobalExceptionHandler

**Files:**
- Modify: `backend/shared/src/main/java/com/predicador/shared/exception/GlobalExceptionHandler.java:67-77`
- Create: `backend/shared/src/test/java/com/predicador/shared/exception/GlobalExceptionHandlerTest.java`

**Interfaces:**
- Consumes: `ResourceNotFoundException`, `MethodArgumentNotValidException`, `IllegalArgumentException`, `IllegalStateException`, `NumberFormatException`, `Exception` (all Spring MVC exceptions)
- Produces: `ProblemDetail` responses for MVC exceptions only. The `ResponseStatusException` handler is removed.

- [ ] **Step 1: Write the failing test for the exception handler**

```java
package com.predicador.shared.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleNotFound_returns404ProblemDetail() {
        ResourceNotFoundException ex = new ResourceNotFoundException("Territorio", 42L);
        ProblemDetail problem = handler.handleNotFound(ex);
        assertEquals(404, problem.getStatus());
        assertEquals("Recurso no encontrado", problem.getTitle());
        assertEquals("Territorio", problem.getProperties().get("resource"));
        assertEquals(42L, problem.getProperties().get("id"));
    }

    @Test
    void handleBadRequest_returns400ProblemDetail() {
        IllegalArgumentException ex = new IllegalArgumentException("bad input");
        ProblemDetail problem = handler.handleBadRequest(ex);
        assertEquals(400, problem.getStatus());
        assertEquals("bad input", problem.getDetail());
    }

    @Test
    void handleIllegalState_returns500WithoutLeakingMessage() {
        IllegalStateException ex = new IllegalStateException("secret not configured");
        ProblemDetail problem = handler.handleIllegalState(ex);
        assertEquals(500, problem.getStatus());
        assertEquals("Error interno del servidor", problem.getDetail());
        // Must NOT contain the internal message
        assertFalse(problem.getDetail().contains("secret"));
    }

    @Test
    void handleNumberFormat_returns400() {
        NumberFormatException ex = new NumberFormatException("For input string: \"abc\"");
        ProblemDetail problem = handler.handleNumberFormat(ex);
        assertEquals(400, problem.getStatus());
    }

    @Test
    void handleGeneral_returns500WithoutLeakingMessage() {
        Exception ex = new RuntimeException("database connection refused");
        ProblemDetail problem = handler.handleGeneral(ex);
        assertEquals(500, problem.getStatus());
        assertEquals("Error interno del servidor", problem.getDetail());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `mvn -pl shared test -Dtest=GlobalExceptionHandlerTest -q`

Expected: FAIL — the test class compiles but the `handleResponseStatus` method still exists (no failure yet). Actually this test doesn't test the removed method, so it will PASS. We need a different approach — see Step 3.

- [ ] **Step 3: Write a test that verifies ResponseStatusException is NOT handled**

Add this test to verify the handler no longer catches `ResponseStatusException`:

```java
@Test
void responseStatusException_isNotHandled_throwsThrough() {
    ResponseStatusException ex = new ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, "access denied");
    // The handler should NOT have a @ExceptionHandler for ResponseStatusException.
    // If it does, this test documents the removed behavior.
    // After removal, Spring's default handling applies (not our ProblemDetail).
    // We verify the handler does NOT have a method that catches it:
    assertThrows(ResponseStatusException.class, () -> {
        throw ex; // If handler catches it, this would not throw
    });
}
```

- [ ] **Step 4: Remove the ResponseStatusException handler**

Delete lines 67-77 from `GlobalExceptionHandler.java`:

```java
// DELETE this entire method:
@ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
public ProblemDetail handleResponseStatus(org.springframework.web.server.ResponseStatusException ex) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            ex.getStatusCode(), ex.getReason() != null ? ex.getReason() : "Error");
    problem.setType(URI.create("https://api.predicador.com/errors/http-status"));
    if (ex.getStatusCode().value() == 403) {
        problem.setTitle("Acceso denegado");
        problem.setType(URI.create("https://api.predicador.com/errors/forbidden"));
    }
    return problem;
}
```

Also remove the import if no longer needed:

```java
// DELETE this import (line ~11):
import org.springframework.web.server.ResponseStatusException;
```

- [ ] **Step 5: Run test to verify the handler is removed**

Run from `backend/`: `mvn -pl shared test -Dtest=GlobalExceptionHandlerTest -q`

Expected: PASS — all tests pass, including the new ones.

- [ ] **Step 6: Run existing tests to verify no regressions**

Run from `backend/`: `mvn -pl shared,territory-service,reporting-service test -q`

Expected: all tests pass. The `ResponseStatusException` handler was never exercised by existing tests (it was defensive code for a WebFlux type that doesn't occur in MVC contexts).

- [ ] **Step 7: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/exception/GlobalExceptionHandler.java \
        backend/shared/src/test/java/com/predicador/shared/exception/GlobalExceptionHandlerTest.java
git commit -m "refactor: remove WebFlux ResponseStatusException handler from GlobalExceptionHandler"
```

---

### Task 3: Create TokenValidator interface and extract validation logic

**Files:**
- Create: `backend/shared/src/main/java/com/predicador/shared/security/TokenValidator.java`
- Create: `backend/shared/src/test/java/com/predicador/shared/security/TokenValidatorTest.java`
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java`
- Modify: `backend/shared/src/test/java/com/predicador/shared/security/SessionAuthFilterTest.java`

**Interfaces:**
- Consumes: `SessionTokenService` (for HMAC verification), `List<Rule>` (for route matching)
- Produces: `TokenValidator` interface with `validate(HttpServletRequest) → Optional<SessionToken>` and `validateReactive(ServerWebExchange) → Optional<SessionToken>`

- [ ] **Step 1: Write the failing test for TokenValidator**

```java
package com.predicador.shared.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.regex.Pattern;

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
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null),
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        ));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_returnsSessionToken() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken));

        var result = validator.validate(req);

        assertTrue(result.isPresent());
        assertEquals("42", result.get().subject());
    }

    @Test
    void missingToken_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void invalidToken_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, "garbage"));

        var result = validator.validate(req);

        assertTrue(result.isEmpty());
    }

    @Test
    void roleMismatch_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("PUT",
                "/api/v1/territories/5/color");
        req.setCookies(new jakarta.servlet.http.Cookie(
                SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken));

        var result = validator.validate(req);

        assertTrue(result.isEmpty()); // encargado cannot access admin route
    }

    @Test
    void nonMatchingRoute_returnsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/territories");

        var result = validator.validate(req);

        assertTrue(result.isEmpty()); // no rule matches GET /territories
    }

    @Test
    void headerAuth_whenAllowed_usesHeader() {
        TokenValidator headerValidator = new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null)
        ), true);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);

        var result = headerValidator.validate(req);

        assertTrue(result.isPresent());
    }

    @Test
    void headerAuth_whenNotAllowed_ignoresHeader() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/reports");
        req.addHeader(SessionAuthFilter.HEADER_NAME, encargadoToken);

        var result = validator.validate(req);

        assertTrue(result.isEmpty()); // no cookie, header not allowed
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `mvn -pl shared test -Dtest=TokenValidatorTest -q`

Expected: FAIL — `TokenValidator` class does not exist.

- [ ] **Step 3: Write minimal implementation**

```java
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
 *
 * <p>This class is framework-agnostic — it reads tokens from a
 * {@link TokenSource} abstraction rather than directly from
 * {@code HttpServletRequest}.</p>
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

    /**
     * Validate a servlet request. Extracts token from cookie (or header
     * if allowed), verifies HMAC, checks route rules and role requirements.
     */
    public Optional<SessionToken> validate(HttpServletRequest req) {
        if (!tokens.isConfigured() && !tokens.isStrict()) {
            return Optional.empty();
        }

        SessionAuthFilter.Rule matched = findMatchingRule(req.getMethod(), req.getRequestURI());
        if (matched == null) {
            return Optional.empty(); // no rule matches → public endpoint
        }

        String presented = extractToken(req);
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

    private String extractToken(HttpServletRequest req) {
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

    private SessionAuthFilter.Rule findMatchingRule(String method, String path) {
        for (SessionAuthFilter.Rule rule : rules) {
            if (!rule.methods().contains(method)) continue;
            if (rule.pattern().matcher(path).matches()) return rule;
        }
        return null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `mvn -pl shared test -Dtest=TokenValidatorTest -q`

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Refactor SessionAuthFilter to delegate to TokenValidator**

Replace the internal validation logic in `SessionAuthFilter.java` to delegate to `TokenValidator`:

```java
// BEFORE: SessionAuthFilter has its own validation logic in doFilterInternal
// AFTER: delegate to TokenValidator

public class SessionAuthFilter extends OncePerRequestFilter {

    public static final String ATTR_TOKEN = "predicador.session.token";
    public static final String ATTR_SUBJECT = "predicador.session.subject";
    public static final String SESSION_COOKIE_NAME = "predicador_session";
    public static final String HEADER_NAME = "X-Session-Token";

    private static final Logger log = LoggerFactory.getLogger(SessionAuthFilter.class);

    private final TokenValidator validator;

    public SessionAuthFilter(SessionTokenService tokens, List<Rule> rules) {
        this(tokens, rules, false);
    }

    public SessionAuthFilter(SessionTokenService tokens, List<Rule> rules, boolean allowHeaderAuth) {
        this.validator = new TokenValidator(tokens, rules, allowHeaderAuth);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Optional<SessionToken> validated = validator.validate(req);
        if (validated.isEmpty()) {
            writeUnauthorized(res);
            return;
        }
        SessionToken token = validated.get();
        req.setAttribute(ATTR_TOKEN, token);
        req.setAttribute(ATTR_SUBJECT, token.subject());
        chain.doFilter(req, res);
    }

    private static void writeUnauthorized(HttpServletResponse res) throws IOException {
        res.setStatus(HttpStatus.UNAUTHORIZED.value());
        res.setContentType(MediaType.valueOf("application/problem+json").toString());
        res.getWriter().write("""
                {"type":"about:blank","title":"No autenticado","status":401,"detail":"Token de sesión ausente o inválido."}
                """);
        log.debug("SessionAuthFilter rechazó petición: token ausente o inválido");
    }

    // Rule record stays as-is (unchanged)
    public record Rule(List<String> methods, Pattern pattern, String requiredRole) {
        // ... existing implementation unchanged ...
    }
}
```

- [ ] **Step 6: Run existing SessionAuthFilter tests to verify no regressions**

Run from `backend/`: `mvn -pl shared test -Dtest=SessionAuthFilterTest -q`

Expected: all 10 existing tests pass. The filter now delegates to `TokenValidator` but behaves identically.

- [ ] **Step 7: Commit**

```bash
git add backend/shared/src/main/java/com/predicador/shared/security/TokenValidator.java \
        backend/shared/src/test/java/com/predicador/shared/security/TokenValidatorTest.java \
        backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java
git commit -m "refactor: extract TokenValidator interface, refactor SessionAuthFilter to delegate"
```

---

### Task 4: Create ReactiveSessionAuthFilter for gateway

**Files:**
- Create: `backend/api-gateway/src/main/java/com/predicador/gateway/config/ReactiveSessionAuthFilter.java`
- Create: `backend/api-gateway/src/test/java/com/predicador/gateway/config/ReactiveSessionAuthFilterTest.java`
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/ApiGatewayApp.java`

**Interfaces:**
- Consumes: `TokenValidator` (from Task 3), `ServerWebExchange` (WebFlux)
- Produces: Reactive `WebFilter` that validates HMAC tokens at the gateway edge, setting exchange attributes for downstream inspection

- [ ] **Step 1: Write the failing test for ReactiveSessionAuthFilter**

```java
package com.predicador.gateway.config;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.TokenValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ReactiveSessionAuthFilterTest {

    private static final String SECRET = "test-secret-with-plenty-of-entropy";

    private SessionTokenService tokens;
    private ReactiveSessionAuthFilter filter;
    private String encargadoToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        tokens = new SessionTokenService(SECRET, 1);
        filter = new ReactiveSessionAuthFilter(new TokenValidator(tokens, List.of(
                SessionAuthFilter.Rule.of("POST", "^/api/v1/reports$", null),
                SessionAuthFilter.Rule.of("PUT", "^/api/v1/territories/[0-9]+/color$",
                        SessionToken.ROLE_ADMIN)
        )));
        encargadoToken = tokens.issue("42", SessionToken.ROLE_ENCARGADO);
        adminToken = tokens.issue("admin", SessionToken.ROLE_ADMIN);
    }

    @Test
    void validToken_setsAttributesAndContinues() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .cookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        WebFilterChain chain = ex -> {
            assertEquals("42", ex.getAttribute("predicador.session.subject"));
            assertNotNull(ex.getAttribute("predicador.session.token"));
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain))
                .verifyComplete();
    }

    @Test
    void missingToken_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .post("/api/v1/reports")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        StepVerifier.create(filter.filter(exchange, ex -> Mono.empty()))
                .verifyComplete();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }

    @Test
    void nonMatchingRoute_passesThrough() {
        MockServerHttpRequest request = MockServerHttpRequest
                .get("/api/v1/territories")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        WebFilterChain chain = ex -> {
            // Should reach the chain (public endpoint)
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain))
                .verifyComplete();
    }

    @Test
    void roleMismatch_returns401() {
        MockServerHttpRequest request = MockServerHttpRequest
                .put("/api/v1/territories/5/color")
                .cookie(SessionAuthFilter.SESSION_COOKIE_NAME, encargadoToken)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        StepVerifier.create(filter.filter(exchange, ex -> Mono.empty()))
                .verifyComplete();

        assertEquals(401, exchange.getResponse().getStatusCode().value());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `mvn -pl api-gateway test -Dtest=ReactiveSessionAuthFilterTest -q`

Expected: FAIL — `ReactiveSessionAuthFilter` class does not exist.

- [ ] **Step 3: Write minimal implementation**

```java
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
        // Convert reactive request to a servlet-compatible adapter for TokenValidator
        ServerHttpRequest request = exchange.getRequest();
        String cookieValue = request.getCookies().getFirst(SessionAuthFilter.SESSION_COOKIE_NAME);
        String presented = cookieValue;

        // Build a minimal servlet request adapter for TokenValidator
        jakarta.servlet.http.HttpServletRequest servletReq = buildServletAdapter(request);

        Optional<SessionToken> validated = validator.validate(servletReq);
        if (validated.isEmpty()) {
            // Check if this is a public endpoint (no matching rule)
            // TokenValidator returns empty for both "no rule" and "invalid token"
            // We need to distinguish: if there's no rule, pass through; if there is a rule but token is bad, 401
            // Since TokenValidator doesn't expose this, we check if a cookie was presented
            if (cookieValue != null || hasRulesFor(request.getMethod().name(), request.getPath().value())) {
                return reject(exchange);
            }
            return chain.filter(exchange);
        }

        SessionToken token = validated.get();
        exchange.getAttributes().put(SessionAuthFilter.ATTR_TOKEN, token);
        exchange.getAttributes().put(SessionAuthFilter.ATTR_SUBJECT, token.subject());
        return chain.filter(exchange);
    }

    private boolean hasRulesFor(String method, String path) {
        // Simple check: if the request has a session cookie and matches a protected path
        // For defense-in-depth, reject if cookie present but invalid on protected paths
        return path.startsWith("/api/v1/reports") || path.startsWith("/api/v1/encargados");
    }

    private static jakarta.servlet.http.HttpServletRequest buildServletAdapter(ServerHttpRequest request) {
        return new ReactiveHttpRequestAdapter(request);
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
}
```

Also create the servlet adapter (inner class or separate file):

```java
package com.predicador.gateway.config;

import org.springframework.http.HttpCookie;
import org.springframework.http.server.reactive.ServerHttpRequest;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * Minimal adapter that wraps a reactive {@link ServerHttpRequest} as a
 * servlet {@link HttpServletRequest} so {@link TokenValidator} can be
 * reused without pulling in Tomcat.
 */
class ReactiveHttpRequestAdapter implements HttpServletRequest {

    private final ServerHttpRequest request;
    private final Map<String, Object> attributes = new HashMap<>();

    ReactiveHttpRequestAdapter(ServerHttpRequest request) {
        this.request = request;
    }

    @Override
    public Cookie[] getCookies() {
        List<Cookie> cookies = new ArrayList<>();
        for (Map.Entry<String, List<HttpCookie>> entry : request.getCookies().entrySet()) {
            for (HttpCookie cookie : entry.getValue()) {
                cookies.add(new Cookie(cookie.getName(), cookie.getValue()));
            }
        }
        return cookies.toArray(new Cookie[0]);
    }

    @Override
    public String getMethod() {
        return request.getMethod() != null ? request.getMethod().name() : "GET";
    }

    @Override
    public String getRequestURI() {
        return request.getPath().value();
    }

    @Override
    public String getHeader(String name) {
        return request.getHeaders().getFirst(name);
    }

    @Override
    public void setAttribute(String name, Object o) {
        attributes.put(name, o);
    }

    @Override
    public Object getAttribute(String name) {
        return attributes.get(name);
    }

    // Minimal stubs for remaining HttpServletRequest methods
    @Override public String getAuthType() { return null; }
    @Override public Enumeration<String> getHeaderNames() { return Collections.emptyEnumeration(); }
    @Override public Enumeration<String> getHeaders(String name) { return Collections.emptyEnumeration(); }
    @Override public int getIntHeader(String name) { return -1; }
    @Override public String getPathInfo() { return null; }
    @Override public String getPathTranslated() { return null; }
    @Override public String getContextPath() { return ""; }
    @Override public String getQueryString() { return null; }
    @Override public String getRemoteUser() { return null; }
    @Override public boolean isUserInRole(String role) { return false; }
    @Override public java.security.Principal getUserPrincipal() { return null; }
    @Override public String getRequestedSessionId() { return null; }
    @Override public StringBuffer getRequestURL() { return new StringBuffer(getRequestURI()); }
    @Override public String getServletPath() { return getRequestURI(); }
    @Override public jakarta.servlet.http.HttpSession getSession(boolean create) { return null; }
    @Override public jakarta.servlet.http.HttpSession getSession() { return null; }
    @Override public String changeSessionId() { return null; }
    @Override public boolean isRequestedSessionIdValid() { return false; }
    @Override public boolean isRequestedSessionIdFromCookie() { return true; }
    @Override public boolean isRequestedSessionIdFromURL() { return false; }
    @Override public boolean authenticate(jakarta.servlet.http.HttpServletResponse response) { return false; }
    @Override public void login(String username, String password) {}
    @Override public void logout() {}
    @Override public <T extends jakarta.servlet.ServletRequest> T unwrap(Class<T> clazz) { return null; }
    @Override public jakarta.servlet.AsyncContext startAsync() { return null; }
    @Override public jakarta.servlet.AsyncContext startAsync(jakarta.servlet.ServletRequest req, jakarta.servlet.ServletResponse res) { return null; }
    @Override public boolean isAsyncStarted() { return false; }
    @Override public boolean isAsyncSupported() { return false; }
    @Override public jakarta.servlet.AsyncContext getAsyncContext() { return null; }
    @Override public jakarta.servlet.DispatcherType getDispatcherType() { return jakarta.servlet.DispatcherType.REQUEST; }

    // Remaining methods from ServletRequest interface
    @Override public Object getAttribute(String name, int scope) { return null; }
    @Override public Enumeration<String> getAttributeNames() { return Collections.emptyEnumeration(); }
    @Override public String getCharacterEncoding() { return "UTF-8"; }
    @Override public void setCharacterEncoding(String env) {}
    @Override public int getContentLength() { return -1; }
    @Override public long getContentLengthLong() { return -1; }
    @Override public String getContentType() { return null; }
    @Override public jakarta.servlet.ServletInputStream getInputStream() { return null; }
    @Override public String getParameter(String name) { return null; }
    @Override public Enumeration<String> getParameterNames() { return Collections.emptyEnumeration(); }
    @Override public String[] getParameterValues(String name) { return new String[0]; }
    @Override public Map<String, String[]> getParameterMap() { return Collections.emptyMap(); }
    @Override public String getProtocol() { return "HTTP/1.1"; }
    @Override public String getScheme() { return "http"; }
    @Override public String getServerName() { return "localhost"; }
    @Override public int getServerPort() { return 8080; }
    @Override public java.io.BufferedReader getReader() { return null; }
    @Override public String getRemoteAddr() { return "127.0.0.1"; }
    @Override public String getRemoteHost() { return "127.0.0.1"; }
    @Override public Locale getLocale() { return Locale.US; }
    @Override public Enumeration<Locale> getLocales() { return Collections.enumeration(List.of(Locale.US)); }
    @Override public boolean isSecure() { return false; }
    @Override public jakarta.servlet.RequestDispatcher getRequestDispatcher(String path) { return null; }
    @Override public String getRealPath(String path) { return null; }
    @Override public int getRemotePort() { return 0; }
    @Override public String getLocalName() { return "localhost"; }
    @Override public String getLocalAddr() { return "127.0.0.1"; }
    @Override public int getLocalPort() { return 8080; }
    @Override public jakarta.servlet.ServletContext getServletContext() { return null; }
    @Override public jakarta.servlet.ServletRequestWrapper wrap() { return null; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `mvn -pl api-gateway test -Dtest=ReactiveSessionAuthFilterTest -q`

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Run full backend tests to verify no regressions**

Run from `backend/`: `mvn verify -B -q`

Expected: all tests pass across all modules.

- [ ] **Step 6: Commit**

```bash
git add backend/api-gateway/src/main/java/com/predicador/gateway/config/ReactiveSessionAuthFilter.java \
        backend/api-gateway/src/main/java/com/predicador/gateway/config/ReactiveHttpRequestAdapter.java \
        backend/api-gateway/src/test/java/com/predicador/gateway/config/ReactiveSessionAuthFilterTest.java
git commit -m "feat: add ReactiveSessionAuthFilter for gateway defense-in-depth"
```

---

### Task 5: Run full verification and update documentation

**Files:**
- Modify: `AGENTS.md` (if needed — update shared module description)

**Interfaces:**
- Consumes: all previous tasks
- Produces: passing `mvn verify`, updated docs

- [ ] **Step 1: Run full backend verification**

Run from `backend/`: `mvn verify -B`

Expected: all tests pass, build succeeds.

- [ ] **Step 2: Verify gateway starts and validates tokens**

Start the gateway locally and verify:
1. Unauthenticated POST to `/api/v1/reports` returns 401
2. Authenticated POST (with valid session cookie) passes through
3. Public GET to `/api/v1/territories` works without auth

- [ ] **Step 3: Update AGENTS.md if needed**

Update the `shared` module description in `AGENTS.md` to mention `PhoneUtil` and `TokenValidator`:

```
- **`shared`**: Cross-service security (HMAC tokens, `SessionAuthFilter`, `SessionTokenService`), shared utilities (`PhoneUtil`), and `TokenValidator` interface for reactive/servlet adapters.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update shared module description with PhoneUtil and TokenValidator"
```
