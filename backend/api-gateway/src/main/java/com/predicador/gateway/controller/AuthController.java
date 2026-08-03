package com.predicador.gateway.controller;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SessionAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Admin login endpoint.
 *
 * <p>Kept intentionally minimal because the app has a single admin operator
 * whose credentials come from env vars. Two accepted formats:</p>
 *
 * <ul>
 *   <li>{@code ADMIN_PASSWORD_BCRYPT} — BCrypt hash (recommended, generated
 *       with {@code htpasswd -bnBC 10 "" 'plain' | tr -d ':\n'}).</li>
 *   <li>{@code ADMIN_PASSWORD} — plaintext fallback for local dev.</li>
 * </ul>
 *
 * <p>On success returns a signed session token (HMAC-SHA256). Timing-safe
 * password comparison is used for the plaintext branch.</p>
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final String adminUsername;
    private final String adminPassword;
    private final String adminPasswordBcrypt;
    private final SessionTokenService tokens;
    private final boolean sessionCookieSecure;

    public AuthController(
            SessionTokenService tokens,
            @Value("${app.admin.username:}") String adminUsername,
            @Value("${app.admin.password:}") String adminPassword,
            @Value("${app.admin.password-bcrypt:}") String adminPasswordBcrypt,
            @Value("${app.session.cookie-secure:false}") boolean sessionCookieSecure) {
        this.tokens = tokens;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
        this.adminPasswordBcrypt = adminPasswordBcrypt;
        this.sessionCookieSecure = sessionCookieSecure;
        if (tokens.isStrict() && (adminPasswordBcrypt == null || adminPasswordBcrypt.isBlank())) {
            throw new IllegalArgumentException("app.admin.password-bcrypt es obligatorio fuera del perfil local");
        }
    }

    /** Vida de la sesión; coincide con el TTL del token firmado. */
    private static final Duration SESSION_TTL = Duration.ofHours(12);

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials, ServerWebExchange exchange) {
        String username = credentials.getOrDefault("username", "");
        String password = credentials.getOrDefault("password", "");

        if (adminUsername == null || !adminUsername.equals(username) || !passwordMatches(password)) {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.UNAUTHORIZED, "Credenciales incorrectas");
            problem.setTitle("Autenticación fallida");
            problem.setType(URI.create("https://api.predicador.com/errors/auth-failed"));
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(problem);
        }

        String token = tokens.issue("admin", SessionToken.ROLE_ADMIN);
        // La cookie CSRF la emite y rota CsrfProtectionFilter; aquí solo la sesión.
        exchange.getResponse().addCookie(sessionCookie(token, SESSION_TTL));
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Autenticación exitosa",
                "role", SessionToken.ROLE_ADMIN));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(ServerWebExchange exchange) {
        exchange.getResponse().addCookie(sessionCookie("", Duration.ZERO));
        return ResponseEntity.noContent().build();
    }

    /**
     * Cookie de sesión construida con {@link ResponseCookie} en lugar de un
     * header a mano: los atributos se serializan según RFC 6265 y no es posible
     * escribir combinaciones que el navegador interprete al revés (p. ej.
     * {@code HttpOnly=false}, que <em>sí</em> activa HttpOnly).
     */
    private ResponseCookie sessionCookie(String value, Duration maxAge) {
        return ResponseCookie.from(SessionAuthFilter.SESSION_COOKIE_NAME, value)
                .httpOnly(true)
                .secure(sessionCookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private boolean passwordMatches(String provided) {
        if (adminPasswordBcrypt != null && !adminPasswordBcrypt.isBlank()) {
            try {
                return BCrypt.checkpw(provided, adminPasswordBcrypt);
            } catch (IllegalArgumentException e) {
                // Malformed hash — treat as configuration failure, refuse login.
                return false;
            }
        }
        if (tokens.isStrict() || adminPassword == null || adminPassword.isBlank()) {
            return false;
        }
        return constantTimeEquals(adminPassword, provided);
    }

    private static boolean constantTimeEquals(String a, String b) {
        byte[] ab = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        if (ab.length != bb.length) {
            // Walk the shorter array to avoid out-of-bounds; length mismatch
            // itself leaks via timing but is acceptable for password comparison
            // (the attacker already knows the expected length from the user field).
            int len = Math.min(ab.length, bb.length);
            for (int i = 0; i < len; i++) {
                // Intentional no-op: burn CPU cycles to equalize branch timing.
                @SuppressWarnings("unused")
                int unused = ab[i] ^ bb[i];
            }
            return false;
        }
        int diff = 0;
        for (int i = 0; i < ab.length; i++) {
            diff |= ab[i] ^ bb[i];
        }
        return diff == 0;
    }
}
