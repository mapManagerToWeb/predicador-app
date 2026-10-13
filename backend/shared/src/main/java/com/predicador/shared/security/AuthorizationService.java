package com.predicador.shared.security;

import com.predicador.shared.exception.ForbiddenOperationException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Autorización de servicio: decide si un {@link SessionToken} puede ejecutar
 * una operación. Es la segunda capa de defensa — la primera son las reglas de
 * {@link SecurityRules} en el borde — y vive aquí porque los controladores de
 * administración de los tres servicios (territory y reporting) la necesitan
 * (ADR 0016).
 */
@Service
public class AuthorizationService {

    private final SessionTokenService tokens;

    public AuthorizationService() {
        this(null);
    }

    @Autowired
    public AuthorizationService(SessionTokenService tokens) {
        this.tokens = tokens;
    }

    public void authorizeOwner(SessionToken token, Long ownerId) {
        if (token == null) {
            if (isUnenforcedDevMode()) {
                return;
            }
            throw new ForbiddenOperationException(
                    "No tiene permisos para acceder a los datos de este encargado");
        }
        if (token.hasRole(SessionToken.ROLE_ADMIN)) {
            return;
        }
        if (!token.hasRole(SessionToken.ROLE_ENCARGADO)
                || ownerId == null
                || !String.valueOf(ownerId).equals(token.subject())) {
            throw new ForbiddenOperationException(
                    "No tiene permisos para acceder a los datos de este encargado");
        }
    }

    public void requireAdmin(SessionToken token) {
        if (token == null) {
            if (isUnenforcedDevMode()) {
                return;
            }
            throw new ForbiddenOperationException(
                    "Esta operación requiere permisos de administrador");
        }
        if (!token.hasRole(SessionToken.ROLE_ADMIN)) {
            throw new ForbiddenOperationException(
                    "Esta operación requiere permisos de administrador");
        }
    }

    public void requireAuthenticated(SessionToken token) {
        if (token == null) {
            if (isUnenforcedDevMode()) {
                return;
            }
            throw new ForbiddenOperationException("Se requiere una sesión válida");
        }
    }

    private boolean isUnenforcedDevMode() {
        return tokens != null && !tokens.isConfigured() && !tokens.isStrict();
    }
}
