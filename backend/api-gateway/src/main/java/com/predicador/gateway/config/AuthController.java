package com.predicador.gateway.config;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @Value("${app.admin.username:admin}")
    private String adminUsername;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Value("${app.admin.password-bcrypt:}")
    private String adminPasswordBcrypt;

    private final SessionTokenService tokens;

    public AuthController(SessionTokenService tokens) {
        this.tokens = tokens;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.getOrDefault("username", "");
        String password = credentials.getOrDefault("password", "");

        if (!adminUsername.equals(username) || !passwordMatches(password)) {
            return ResponseEntity.status(401).body(Map.of(
                    "success", false,
                    "message", "Credenciales incorrectas"));
        }

        String token = tokens.issue("admin", SessionToken.ROLE_ADMIN);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Autenticación exitosa",
                "token", token,
                "role", SessionToken.ROLE_ADMIN));
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
        if (adminPassword == null || adminPassword.isBlank()) {
            return false;
        }
        return constantTimeEquals(adminPassword, provided);
    }

    private static boolean constantTimeEquals(String a, String b) {
        byte[] ab = a.getBytes();
        byte[] bb = b.getBytes();
        if (ab.length != bb.length) {
            // Still walk the array to keep timing roughly stable.
            int mismatch = 1;
            int len = Math.min(ab.length, bb.length);
            for (int i = 0; i < len; i++) {
                mismatch |= ab[i] ^ bb[i];
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
