package com.predicador.reporting.dto;

/**
 * Response wrapper for successful logins/registrations. Includes both the
 * encargado payload and the freshly minted session token so the frontend can
 * persist it alongside the profile without a second round-trip.
 */
public record LoginResponse(EncargadoDto encargado, String token) {}
