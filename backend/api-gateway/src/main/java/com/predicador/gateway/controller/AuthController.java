package com.predicador.gateway.controller;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.gateway.sistema.ClaveAdministrador;
import com.predicador.shared.security.SessionAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import java.net.URI;
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
    private final SessionTokenService tokens;
    private final boolean sessionCookieSecure;
    private final ClaveAdministrador clave;

    public AuthController(
            SessionTokenService tokens,
            @Value("${app.admin.username:}") String adminUsername,
            @Value("${app.admin.password:}") String adminPassword,
            @Value("${app.admin.password-bcrypt:}") String adminPasswordBcrypt,
            @Value("${app.session.cookie-secure:false}") boolean sessionCookieSecure) {
        this.tokens = tokens;
        this.adminUsername = adminUsername;
        this.sessionCookieSecure = sessionCookieSecure;
        this.clave = new ClaveAdministrador(adminPassword, adminPasswordBcrypt, tokens.isStrict());
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
        return clave.coincide(provided);
    }
}
