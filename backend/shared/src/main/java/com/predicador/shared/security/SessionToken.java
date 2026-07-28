package com.predicador.shared.security;

import java.util.Objects;

/**
 * Parsed session token payload.
 *
 * @param subject     opaque identifier of the authenticated principal.
 *                    For encargados this is the numeric {@code encargadoId}
 *                    as a string. For the admin login it is {@code "admin"}.
 * @param role        {@code "encargado"} or {@code "admin"}.
 * @param issuedAt    unix seconds when the token was minted.
 * @param expiresAt   unix seconds after which the token must be rejected.
 */
public record SessionToken(String subject, String role, long issuedAt, long expiresAt) {

    public static final String ROLE_ENCARGADO = "encargado";
    public static final String ROLE_ADMIN = "admin";

    public SessionToken {
        Objects.requireNonNull(subject, "subject");
        Objects.requireNonNull(role, "role");
        if (issuedAt <= 0 || expiresAt <= issuedAt) {
            throw new IllegalArgumentException("issuedAt/expiresAt inválidos");
        }
    }

    public boolean isExpired(long nowSeconds) {
        return nowSeconds >= expiresAt;
    }

    public boolean hasRole(String expected) {
        return role.equals(expected);
    }
}
