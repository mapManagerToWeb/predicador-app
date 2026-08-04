package com.predicador.shared.security;

public final class SecurityContext {
    private static final ThreadLocal<SessionToken> HOLDER = new ThreadLocal<>();
    private SecurityContext() {}
    public static void setToken(SessionToken token) { HOLDER.set(token); }
    public static SessionToken getToken() { return HOLDER.get(); }
    public static String getSubject() { SessionToken t = getToken(); return t != null ? t.subject() : null; }
    public static void clear() { HOLDER.remove(); }
}