package com.predicador.reporting.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Bean Validation contract tests for the DTOs added / hardened in Fase 0.
 *
 * <p>MockMvc with {@code standaloneSetup} does not wire the JSR-380 validator
 * automatically, so controller tests do not exercise these constraints. This
 * suite validates the DTOs directly against a bootstrapped {@link Validator}
 * to keep the contracts documented and enforced.</p>
 */
class DtoValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void bootstrap() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void teardown() {
        factory.close();
    }

    // ------------------------------------------------------------------ Encargado

    @Test
    void encargadoDto_valido_pasa() {
        EncargadoDto ok = new EncargadoDto(1L, "Daniel", "Uribe", 2, "56912345678", true);
        assertTrue(validator.validate(ok).isEmpty());
    }

    @Test
    void encargadoDto_nombreVacio_falla() {
        EncargadoDto bad = new EncargadoDto(1L, "  ", "Uribe", 2, "56912345678", true);
        Set<ConstraintViolation<EncargadoDto>> violations = validator.validate(bad);
        assertFalse(violations.isEmpty());
        assertTrue(violations.stream().anyMatch(v -> v.getPropertyPath().toString().equals("nombre")));
    }

    @Test
    void encargadoDto_telefonoMalFormado_falla() {
        EncargadoDto bad = new EncargadoDto(1L, "Ana", "Perez", 1, "abc", true);
        Set<ConstraintViolation<EncargadoDto>> violations = validator.validate(bad);
        assertTrue(violations.stream().anyMatch(v -> v.getPropertyPath().toString().equals("telefono")));
    }

    @Test
    void encargadoDto_telefonoNulo_esValido() {
        // @Pattern acepta null; sólo valida el formato cuando hay valor.
        EncargadoDto ok = new EncargadoDto(1L, "Ana", "Perez", 1, null, true);
        assertTrue(validator.validate(ok).isEmpty());
    }

    // ------------------------------------------------------------------ Report

    @Test
    void reportDto_valido_pasa() {
        ReportDto ok = new ReportDto(null, "m1", Instant.now(), "Daniel", "Uribe",
                "tarde", "ok", 5L, 1L, 10, 10, "predicacion", null, null, null);
        assertTrue(validator.validate(ok).isEmpty());
    }

    @Test
    void reportDto_sinEncargadoNombre_falla() {
        ReportDto bad = new ReportDto(null, "m1", Instant.now(), " ", "Uribe",
                "tarde", "ok", 5L, 1L, 10, 10, "predicacion", null, null, null);
        assertFalse(validator.validate(bad).isEmpty());
    }

    @Test
    void reportDto_sinTerritorio_falla() {
        ReportDto bad = new ReportDto(null, "m1", Instant.now(), "Daniel", "Uribe",
                "tarde", "ok", null, 1L, 10, 10, "predicacion", null, null, null);
        assertFalse(validator.validate(bad).isEmpty());
    }

    @Test
    void reportDto_territorioNegativo_falla() {
        ReportDto bad = new ReportDto(null, "m1", Instant.now(), "Daniel", "Uribe",
                "tarde", "ok", -1L, 1L, 10, 10, "predicacion", null, null, null);
        assertFalse(validator.validate(bad).isEmpty());
    }

    // ------------------------------------------------------------------ WhatsApp

    @Test
    void whatsAppSendRequest_valido_pasa() {
        WhatsAppSendRequest ok = new WhatsAppSendRequest(
                "Daniel", "Uribe", "21-07-2026", "tarde",
                List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
                null, null);
        assertTrue(validator.validate(ok).isEmpty());
    }

    @Test
    void whatsAppSendRequest_sinTerritorios_falla() {
        WhatsAppSendRequest bad = new WhatsAppSendRequest(
                "Daniel", "Uribe", "21-07-2026", "tarde",
                List.of(), null, null);
        assertFalse(validator.validate(bad).isEmpty());
    }

    @Test
    void whatsAppSendRequest_territorioInterno_invalido_falla() {
        WhatsAppSendRequest bad = new WhatsAppSendRequest(
                "Daniel", "Uribe", "21-07-2026", "tarde",
                List.of(new WhatsAppSendRequest.TerritorioReporte(null, true, 12, 12)),
                null, null);
        Set<ConstraintViolation<WhatsAppSendRequest>> violations = validator.validate(bad);
        assertFalse(violations.isEmpty());
    }
}
