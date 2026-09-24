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

    @Test
    void admin_paths_requireAdminRole_andWinOverGenericRules() {
        var gateway = SecurityRules.GATEWAY;
        var territory = SecurityRules.TERRITORY;
        var reporting = SecurityRules.REPORTING;

        for (String method : List.of("GET", "POST", "PUT", "DELETE")) {
            assertEquals(SessionToken.ROLE_ADMIN, firstMatch(gateway, method, "/api/v1/territories/admin/manzanas/7")
                    .orElseThrow().requiredRole());
            assertEquals(SessionToken.ROLE_ADMIN, firstMatch(territory, method, "/api/v1/territories/admin/manzanas")
                    .orElseThrow().requiredRole());
            assertEquals(SessionToken.ROLE_ADMIN, firstMatch(gateway, method, "/api/v1/reports/admin")
                    .orElseThrow().requiredRole());
            assertEquals(SessionToken.ROLE_ADMIN, firstMatch(reporting, method, "/api/v1/reports/admin/12")
                    .orElseThrow().requiredRole());
            assertEquals(SessionToken.ROLE_ADMIN, firstMatch(reporting, method, "/api/v1/encargados/admin/3/pin")
                    .orElseThrow().requiredRole());
        }
        // Los endpoints públicos del mapa siguen sin exigir sesión.
        assertTrue(firstMatch(territory, "GET", "/api/v1/territories/all/geojson").isEmpty());
        // "admin" como prefijo de otra palabra no debe caer en la regla de admin.
        assertTrue(firstMatch(territory, "GET", "/api/v1/territories/administracion").isEmpty());
    }

    /** Misma semántica que {@link TokenValidator#findMatchingRule}: gana la primera regla. */
    private static java.util.Optional<SecurityRule> firstMatch(List<SecurityRule> rules, String method, String path) {
        return rules.stream()
                .filter(r -> r.methods().contains(method) && r.pattern().matcher(path).matches())
                .findFirst();
    }

    @Test
    void visorPublico_noExigeSesion_peroElRestoDeReportesSi() {
        assertTrue(firstMatch(SecurityRules.REPORTING, "GET", "/api/v1/reports/public/estado").isEmpty());
        assertTrue(firstMatch(SecurityRules.GATEWAY, "GET", "/api/v1/reports/public/estado").isEmpty());
        assertTrue(firstMatch(SecurityRules.REPORTING, "GET", "/api/v1/reports").isPresent());
        assertTrue(firstMatch(SecurityRules.REPORTING, "GET", "/api/v1/reports/batch").isPresent());
        // Un prefijo parecido no se cuela como público.
        assertTrue(firstMatch(SecurityRules.REPORTING, "GET", "/api/v1/reports/publico").isPresent());
    }
}
