package com.predicador.shared.security;

import jakarta.annotation.Nullable;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public record SecurityRule(List<String> methods, Pattern pattern, @Nullable String requiredRole) {
    public SecurityRule {
        Objects.requireNonNull(methods, "methods");
        Objects.requireNonNull(pattern, "pattern");
        methods = List.copyOf(methods);
    }
    public static SecurityRule of(String method, String regex, @Nullable String requiredRole) {
        return new SecurityRule(List.of(method), Pattern.compile(regex), requiredRole);
    }
    public static SecurityRule any(List<String> methods, String regex, @Nullable String requiredRole) {
        return new SecurityRule(methods, Pattern.compile(regex), requiredRole);
    }
}