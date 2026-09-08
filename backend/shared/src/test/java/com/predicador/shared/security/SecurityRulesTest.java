package com.predicador.shared.security;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SecurityRulesTest {
    @Test
    void gateway_rules_matchExpectedEndpoints() {
        assertTrue(SecurityRules.GATEWAY.stream().anyMatch(r ->
                r.methods().contains("POST") && r.pattern().matcher("/api/v1/reports").matches()));
        assertTrue(SecurityRules.GATEWAY.stream().anyMatch(r ->
                r.methods().contains("PUT") && r.requiredRole() != null &&
                r.pattern().matcher("/api/v1/territories/5/color").matches()));
    }
    @Test
    void territory_rules_matchExpectedEndpoints() {
        assertTrue(SecurityRules.TERRITORY.stream().anyMatch(r ->
                r.methods().contains("PUT") && r.requiredRole() != null &&
                r.pattern().matcher("/api/v1/territories/5/color").matches()));
    }
    @Test
    void reporting_rules_matchExpectedEndpoints() {
        assertTrue(SecurityRules.REPORTING.stream().anyMatch(r ->
                r.methods().contains("GET") && r.pattern().matcher("/api/v1/reports").matches()));
        assertTrue(SecurityRules.REPORTING.stream().anyMatch(r ->
                r.methods().contains("GET") && r.pattern().matcher("/api/v1/encargados").matches()));
    }
}