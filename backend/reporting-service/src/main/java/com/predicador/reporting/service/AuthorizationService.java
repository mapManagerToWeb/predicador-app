package com.predicador.reporting.service;

import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

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
            throw forbidden("No tiene permisos para acceder a los datos de este encargado");
        }
        if (token.hasRole(SessionToken.ROLE_ADMIN)) {
            return;
        }
        if (!token.hasRole(SessionToken.ROLE_ENCARGADO)
                || ownerId == null
                || !String.valueOf(ownerId).equals(token.subject())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "No tiene permisos para acceder a los datos de este encargado");
        }
    }

    public void requireAdmin(SessionToken token) {
        if (token == null) {
            if (isUnenforcedDevMode()) {
                return;
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Esta operación requiere permisos de administrador");
        }
        if (!token.hasRole(SessionToken.ROLE_ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Esta operación requiere permisos de administrador");
        }
    }

    public void requireAuthenticated(SessionToken token) {
        if (token == null) {
            if (isUnenforcedDevMode()) {
                return;
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Se requiere una sesión válida");
        }
    }

    private boolean isUnenforcedDevMode() {
        return tokens != null && !tokens.isConfigured() && !tokens.isStrict();
    }

    private ResponseStatusException forbidden(String detail) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, detail);
    }
}
