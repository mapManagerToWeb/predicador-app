package com.predicador.shared.security;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SecurityRuleTest {
    @Test void of_createsRuleWithSingleMethod() {
        var rule = SecurityRule.of("POST", "^/api/v1/reports$", null);
        assertEquals(List.of("POST"), rule.methods());
        assertTrue(rule.pattern().matcher("/api/v1/reports").matches());
        assertNull(rule.requiredRole());
    }
    @Test void any_createsRuleWithMultipleMethods() {
        var rule = SecurityRule.any(List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null);
        assertEquals(2, rule.methods().size());
    }
    @Test void methods_areImmutableCopy() {
        var rule = SecurityRule.of("POST", "^/api/v1/reports$", null);
        assertThrows(UnsupportedOperationException.class, () -> rule.methods().add("DELETE"));
    }
}