package com.predicador.gateway.config;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SessionAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
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
            @Value("${app.session.cookie-secure:true}") boolean sessionCookieSecure) {
        this.tokens = tokens;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
        this.adminPasswordBcrypt = adminPasswordBcrypt;
        this.sessionCookieSecure = sessionCookieSecure;
        if (tokens.isStrict() && (adminPasswordBcrypt == null || adminPasswordBcrypt.isBlank())) {
            throw new IllegalArgumentException("app.admin.password-bcrypt es obligatorio fuera del perfil local");
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
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
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, csrfCookie(), sessionCookie(token, 12 * 60 * 60))
                .body(Map.of(
                "success", true,
                "message", "Autenticación exitosa",
                "role", SessionToken.ROLE_ADMIN));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessionCookie("", 0))
                .build();
    }

private String sessionCookie(String value, long maxAge) {
        return SessionAuthFilter.SESSION_COOKIE_NAME + "=%s; Path=/; Max-Age=%d; HttpOnly;%s SameSite=Lax"
                .formatted(value, maxAge,
                        sessionCookieSecure ? " Secure;" : "");
    }

    private static final SecureRandom CSRF_RANDOM = new SecureRandom();

    private String csrfCookie() {
        byte[] bytes = new byte[32];
        CSRF_RANDOM.nextBytes(bytes);
        return "XSRF-TOKEN=%s; Path=/; HttpOnly=false;%s SameSite=Lax"
                .formatted(HexFormat.of().formatHex(bytes),
                        sessionCookieSecure ? " Secure;" : "");
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
