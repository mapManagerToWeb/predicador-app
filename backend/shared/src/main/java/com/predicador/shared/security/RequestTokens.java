package com.predicador.shared.security;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Lee el {@link SessionToken} que {@link SessionAuthFilter} dejó en la
 * petición. Existe para que los controladores no repitan el
 * {@code (SessionToken) request.getAttribute(ATTR_TOKEN)} —con su cast y su
 * posible {@code ClassCastException}— en cada handler.
 */
public final class RequestTokens {

    private RequestTokens() {}

    /**
     * @return el token validado por el filtro, o {@code null} si la petición
     *         no pasó por el filtro o llegó sin sesión. Un {@code null} no es
     *         una sesión válida: {@link AuthorizationService} lo rechaza.
     */
    public static SessionToken token(HttpServletRequest request) {
        Object attribute = request.getAttribute(SecurityConstants.ATTR_TOKEN);
        return attribute instanceof SessionToken token ? token : null;
    }
}
