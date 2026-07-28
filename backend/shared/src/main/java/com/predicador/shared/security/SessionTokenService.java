package com.predicador.shared.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Lightweight session token backed by HMAC-SHA256.
 *
 * <p>Wire format: {@code base64url(subject|role|iat|exp).base64url(sig)}.
 * Similar in spirit to a JWT but without algorithm negotiation or JSON
 * parsing, so it is safe from the classic {@code "alg":"none"} attack and
 * requires no extra dependency.</p>
 *
 * <p>The shared secret {@code app.session.secret} MUST be at least 32 bytes
 * of entropy in production. If it is left empty, the service throws on
 * every {@link #issue} call so we never mint tokens with an empty key.</p>
 *
 * <p>Constant-time comparison is used on verification to prevent timing
 * side-channels revealing the correct signature byte by byte.</p>
 */
@Service
public class SessionTokenService {

    private static final String HMAC_ALGO = "HmacSHA256";
    private static final Base64.Encoder B64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64_URL_DEC = Base64.getUrlDecoder();
    private static final char SEP_PAYLOAD = '|';
    private static final char SEP_TOKEN = '.';

    private final byte[] secret;
    private final Duration ttl;

    public SessionTokenService(
            @Value("${app.session.secret:}") String secret,
            @Value("${app.session.ttl-hours:12}") long ttlHours) {
        this.secret = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        this.ttl = Duration.ofHours(Math.max(1, ttlHours));
    }

    /**
     * Mint a token for {@code subject} + {@code role}. Throws if the secret
     * was not configured — fail closed rather than emit forgeable tokens.
     *
     * <p>{@code subject} and {@code role} must not contain the payload
     * separator {@code '|'}; otherwise the token cannot round-trip.</p>
     */
    public String issue(String subject, String role) {
        requireSecret();
        if (subject.indexOf(SEP_PAYLOAD) >= 0 || role.indexOf(SEP_PAYLOAD) >= 0) {
            throw new IllegalArgumentException(
                    "subject/role no pueden contener el carácter separador '|'");
        }
        long iat = Instant.now().getEpochSecond();
        long exp = iat + ttl.toSeconds();
        String payload = subject + SEP_PAYLOAD + role + SEP_PAYLOAD + iat + SEP_PAYLOAD + exp;
        String encoded = B64_URL.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        String sig = B64_URL.encodeToString(hmac(encoded));
        return encoded + SEP_TOKEN + sig;
    }

    /**
     * Verify a token: checks structure, signature and expiry.
     * Returns {@code Optional.empty()} for every failure case; callers must
     * not distinguish between reasons to avoid oracle leaks.
     */
    public Optional<SessionToken> verify(String token) {
        if (token == null || token.isBlank() || secret.length == 0) {
            return Optional.empty();
        }
        int dot = token.indexOf(SEP_TOKEN);
        if (dot <= 0 || dot >= token.length() - 1) {
            return Optional.empty();
        }
        String encoded = token.substring(0, dot);
        String providedSig = token.substring(dot + 1);
        byte[] expectedSig = hmac(encoded);
        byte[] providedSigBytes;
        try {
            providedSigBytes = B64_URL_DEC.decode(providedSig);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        if (!MessageDigest.isEqual(expectedSig, providedSigBytes)) {
            return Optional.empty();
        }
        String payload;
        try {
            payload = new String(B64_URL_DEC.decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        String[] parts = payload.split("\\|");
        if (parts.length != 4) {
            return Optional.empty();
        }
        try {
            long iat = Long.parseLong(parts[2]);
            long exp = Long.parseLong(parts[3]);
            SessionToken st = new SessionToken(parts[0], parts[1], iat, exp);
            if (st.isExpired(Instant.now().getEpochSecond())) {
                return Optional.empty();
            }
            return Optional.of(st);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    /** Exposed so admin login controller can bail out early if not configured. */
    public boolean isConfigured() {
        return secret.length > 0;
    }

    private void requireSecret() {
        if (secret.length == 0) {
            throw new IllegalStateException(
                    "app.session.secret no está configurado; no se puede emitir token");
        }
    }

    private byte[] hmac(String data) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGO);
            mac.init(new SecretKeySpec(secret, HMAC_ALGO));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo calcular HMAC", e);
        }
    }
}
