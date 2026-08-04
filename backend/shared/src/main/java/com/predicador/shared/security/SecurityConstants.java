package com.predicador.shared.security;

import jakarta.annotation.Nullable;

public final class SecurityConstants {
    private SecurityConstants() {}
    public static final String ATTR_TOKEN = "predicador.session.token";
    public static final String ATTR_SUBJECT = "predicador.session.subject";
    public static final String SESSION_COOKIE_NAME = "predicador_session";
    public static final String HEADER_NAME = "X-Session-Token";
}