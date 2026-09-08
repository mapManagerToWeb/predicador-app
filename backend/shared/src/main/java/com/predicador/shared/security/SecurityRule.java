package com.predicador.shared.security;

import jakarta.annotation.Nullable;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public class SecurityRule {
    private final List<String> methods;
    private final Pattern pattern;
    private final String requiredRole;

    public SecurityRule(List<String> methods, Pattern pattern, @Nullable String requiredRole) {
        Objects.requireNonNull(methods, "methods");
        Objects.requireNonNull(pattern, "pattern");
        this.methods = List.copyOf(methods);
        this.pattern = pattern;
        this.requiredRole = requiredRole;
    }

    public List<String> methods() {
        return methods;
    }

    public Pattern pattern() {
        return pattern;
    }

    public String requiredRole() {
        return requiredRole;
    }

    public static SecurityRule of(String method, String regex, @Nullable String requiredRole) {
        return new SecurityRule(List.of(method), Pattern.compile(regex), requiredRole);
    }

    public static SecurityRule any(List<String> methods, String regex, @Nullable String requiredRole) {
        return new SecurityRule(methods, Pattern.compile(regex), requiredRole);
    }
}