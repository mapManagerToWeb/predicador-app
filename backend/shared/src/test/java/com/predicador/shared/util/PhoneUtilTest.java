package com.predicador.shared.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PhoneUtilTest {

    @Test
    void normalizesChileanMobileNumber() {
        assertEquals("56912345678", PhoneUtil.normalize("912345678"));
    }

    @Test
    void normalizesWithCountryCodeAlreadyPresent() {
        assertEquals("56912345678", PhoneUtil.normalize("+56 9 1234 5678"));
    }

    @Test
    void stripsNonDigitCharacters() {
        assertEquals("56912345678", PhoneUtil.normalize("(56) 9-1234-5678"));
    }

    @Test
    void handlesShortNumberWithoutPrefix() {
        assertEquals("22345678", PhoneUtil.normalize("22345678"));
    }

    @Test
    void returnsNullForNullInput() {
        assertNull(PhoneUtil.normalize(null));
    }

    @Test
    void returnsEmptyForBlankInput() {
        assertEquals("", PhoneUtil.normalize("  "));
    }

    @Test
    void aceptaSoloCelularesChilenos() {
        assertTrue(PhoneUtil.esCelularChileno("912345678"));
        assertTrue(PhoneUtil.esCelularChileno("9 1234 5678"));
        assertTrue(PhoneUtil.esCelularChileno("+56 9 1234 5678"));
        assertTrue(PhoneUtil.esCelularChileno("56912345678"));
        assertFalse(PhoneUtil.esCelularChileno("9123456789"));   // 10 dígitos
        assertFalse(PhoneUtil.esCelularChileno("12345678"));     // 8 dígitos
        assertFalse(PhoneUtil.esCelularChileno("812345678"));    // no empieza con 9
        assertFalse(PhoneUtil.esCelularChileno("+54 9 11 1234 5678"));
        assertFalse(PhoneUtil.esCelularChileno(""));
        assertFalse(PhoneUtil.esCelularChileno(null));
    }
}
