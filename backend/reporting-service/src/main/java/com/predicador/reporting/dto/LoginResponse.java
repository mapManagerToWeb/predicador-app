package com.predicador.reporting.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response wrapper for successful logins/registrations. The session token is
 * intentionally omitted from JSON; the controller sends it only as an
 * HttpOnly cookie.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoginResponse(EncargadoDto encargado, String token) {}
