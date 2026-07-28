package com.predicador.territory.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TerritoryColorRequestTest {

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

    @Test
    void colorValido_pasa() {
        assertTrue(validator.validate(new TerritoryColorRequest("#DC143C")).isEmpty());
        assertTrue(validator.validate(new TerritoryColorRequest("#000000")).isEmpty());
        assertTrue(validator.validate(new TerritoryColorRequest("#ffffff")).isEmpty());
    }

    @Test
    void colorInvalido_falla() {
        assertFalse(validator.validate(new TerritoryColorRequest("DC143C")).isEmpty());
        assertFalse(validator.validate(new TerritoryColorRequest("#DC143")).isEmpty());
        assertFalse(validator.validate(new TerritoryColorRequest("#GGGGGG")).isEmpty());
        assertFalse(validator.validate(new TerritoryColorRequest("")).isEmpty());
    }
}
