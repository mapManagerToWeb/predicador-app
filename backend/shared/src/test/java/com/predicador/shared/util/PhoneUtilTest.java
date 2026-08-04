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
}
