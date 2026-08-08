package com.predicador.shared.security;

import java.util.List;

import com.predicador.shared.security.SessionToken;


public final class SecurityRules {

    private SecurityRules() {}

    
    public static final List<SecurityRule> GATEWAY = List.of(
            SecurityRule.of("POST", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("DELETE", "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null)
    );

    
    public static final List<SecurityRule> TERRITORY = List.of(
            SecurityRule.of("PUT", "^/api/v1/territories/[0-9]+/color$", SessionToken.ROLE_ADMIN)
    );

    
    public static final List<SecurityRule> REPORTING = List.of(
            SecurityRule.any(List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null),
            SecurityRule.of("PUT", "^/api/v1/encargados/[0-9]+$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/?$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/buscar$", null),
            SecurityRule.of("GET", "^/api/v1/encargados/session$", null)
    );
}