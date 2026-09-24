package com.predicador.shared.security;

import java.util.List;

import com.predicador.shared.security.SessionToken;


public final class SecurityRules {

    /**
     * Reportes: exigen sesión, salvo {@code /api/v1/reports/public/**}, que es
     * el estado de los territorios para el visor público (sin datos personales).
     */
    private static final String REPORTS_PATH = "^/api/v1/reports(?!/public(/|$))(/.*)?$";

    /** Métodos cubiertos por las reglas del panel de administración. */
    private static final List<String> ALL_METHODS = List.of("GET", "POST", "PUT", "PATCH", "DELETE");

    /**
     * Endpoints exclusivos del panel de administración. Van primero en cada
     * lista porque gana la primera regla que coincide y {@link #REPORTS_PATH}
     * también cubre {@code /api/v1/reports/admin/**} (con rol encargado).
     */
    private static final SecurityRule TERRITORY_ADMIN = SecurityRule.any(
            ALL_METHODS, "^/api/v1/territories/admin(/.*)?$", SessionToken.ROLE_ADMIN);
    private static final SecurityRule REPORTS_ADMIN = SecurityRule.any(
            ALL_METHODS, "^/api/v1/reports/admin(/.*)?$", SessionToken.ROLE_ADMIN);
    private static final SecurityRule ENCARGADOS_ADMIN = SecurityRule.any(
            ALL_METHODS, "^/api/v1/encargados/admin(/.*)?$", SessionToken.ROLE_ADMIN);

    private SecurityRules() {}

    
    public static final List<SecurityRule> GATEWAY = List.of(
            TERRITORY_ADMIN,
            REPORTS_ADMIN,
            ENCARGADOS_ADMIN,
            SecurityRule.of("POST", REPORTS_PATH, null),
            SecurityRule.of("PUT", REPORTS_PATH, null),
            SecurityRule.of("DELETE", REPORTS_PATH, null),
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null)
    );

    
    public static final List<SecurityRule> TERRITORY = List.of(
            TERRITORY_ADMIN,
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN)
    );

    
    public static final List<SecurityRule> REPORTING = List.of(
            REPORTS_ADMIN,
            ENCARGADOS_ADMIN,
            SecurityRule.any(List.of("GET", "POST"), REPORTS_PATH, null),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/?$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/buscar$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/session$", null)
    );
}