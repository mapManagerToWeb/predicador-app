package com.predicador.shared.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * H4: el filtro comparaba la ruta CRUDA con las reglas, mientras que Spring
 * enruta sobre la ruta DECODIFICADA y NORMALIZADA. Estas pruebas fijan la
 * forma canónica: las tres formas de escribir la misma ruta tienen que dar
 * exactamente la misma cadena, o el filtro y el enrutador dejan de estar de
 * acuerdo sobre a qué endpoint corresponde la petición.
 */
class RequestPathCanonicalizerTest {

    // -- escapes percent -----------------------------------------------------

    @Test
    void decodesPercentEscapeSoEncodedLetterMatchesPlainLetter() {
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/v1/territories/%61dmin/manzanas"));
    }

    @Test
    void decodesEveryEscapeInThePath() {
        assertEquals("/admin/territorios",
                RequestPathCanonicalizer.canonicalize("/%61dmin/%74erritorios"));
    }

    @Test
    void decodesMultiByteUtf8EscapeKeptTogether() {
        // "%C3%B3" son los dos bytes de la "ó": si se decodifican por separado
        // sale un carácter de reemplazo en vez de la letra.
        assertEquals("/admin/canción", RequestPathCanonicalizer.canonicalize("/admin/canci%C3%B3n"));
    }

    @Test
    void leavesPlusAloneBecauseItIsNotASpaceInAPath() {
        assertEquals("/api/v1/reports/a+b", RequestPathCanonicalizer.canonicalize("/api/v1/reports/a+b"));
    }

    @Test
    void pathWithoutEscapesIsReturnedUnchangedApartFromNormalisation() {
        assertEquals("/api/v1/reports", RequestPathCanonicalizer.canonicalize("/api/v1/reports"));
    }

    // -- normalización de segmentos -----------------------------------------

    @Test
    void collapsesRepeatedSlashes() {
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/v1/territories//admin//manzanas"));
    }

    @Test
    void dropsSingleDotSegments() {
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/v1/territories/admin/./manzanas"));
    }

    @Test
    void resolvesDoubleDotSegments() {
        assertEquals("/api/v1/reports", RequestPathCanonicalizer.canonicalize("/api/v1/territories/admin/../../reports"));
    }

    @Test
    void doubleDotCannotEscapeAboveRoot() {
        // Un ".." por encima de la raíz se descarta en vez de atacar hacia
        // atrás: dejar la ruta corta nunca relaja una regla.
        assertEquals("/api/v1/reports",
                RequestPathCanonicalizer.canonicalize("/../../../api/v1/reports"));
    }

    @Test
    void doubleDotPopsASingleSegmentPrefix() {
        // Frontera de `lastIndexOf("/") == 0`: con UN solo segmento acumulado,
        // `canonical` vale "/api", así que el índice es 0 y la condición de
        // salto tiene que ser `>= 0`. Con `> 0` el segmento no se quita y sale
        // "/api/api/v1/territories".
        assertEquals("/api/v1/territories/admin/manzana",
                RequestPathCanonicalizer.canonicalize("/api/../api/v1/territories/admin/manzana"));
    }

    @Test
    void doubleDotPopsAOneSegmentPrefixAndRebuildsTheWholePath() {
        assertEquals("/api/v1/reports",
                RequestPathCanonicalizer.canonicalize("/a/b/../../../api/v1/reports"));
    }

    @Test
    void doubleDotOnASingleSegmentPathCollapsesToRoot() {
        assertEquals("/", RequestPathCanonicalizer.canonicalize("/api/.."));
        assertEquals("/", RequestPathCanonicalizer.canonicalize("/api/../"));
        assertEquals("/", RequestPathCanonicalizer.canonicalize("/api/./.."));
    }

    @Test
    void everyTraversalFormOfTheAdminPathReachesTheAdminRule() {
        // Las formas de escribir la MISMA ruta que el filtro tiene que agrupar
        // bajo la misma regla. "/api/../api/v1/..." y
        // "/a/b/../../../api/v1/..." recorren la banda de un solo segmento
        // acumulado (lastIndexOf("/") == 0), que las pruebas anteriores no
        // cubrian: una usa un prefijo de 4 segmentos y la otra solo el caso
        // isEmpty().
        String admin = "/api/v1/territories/admin/manzana";

        assertEquals(admin, RequestPathCanonicalizer.canonicalize("/api/../api/v1/territories/admin/manzana"));
        assertEquals(admin, RequestPathCanonicalizer.canonicalize("/a/b/../../../api/v1/territories/admin/manzana"));
        assertEquals(admin, RequestPathCanonicalizer.canonicalize("//api//..//api//v1//territories//admin//manzana"));
        assertEquals(admin, RequestPathCanonicalizer.canonicalize("/api/v1/./territories/admin/./manzana"));
    }

    @Test
    void doubleDotPopsOnlyTheSegmentItActuallyClimbs() {
        // "/.." quita UN segmento, no "todo lo que haya antes": aqui el ".."
        // sube solo sobre "v1", asi que el "api" de despues se suma al de antes.
        // Fijarlo evita "arreglar" la clase haciendo que ".." borre de mas.
        assertEquals("/api/api/v1/reports",
                RequestPathCanonicalizer.canonicalize("/api/v1/../api/v1/reports"));
    }

    @Test
    void canonicalOutputAlwaysStartsWithASingleSlash() {
        assertEquals("/admin", RequestPathCanonicalizer.canonicalize("//admin"));
        assertEquals("/admin", RequestPathCanonicalizer.canonicalize("admin"));
    }

    @Test
    void emptyOrNullUriBecomesRoot() {
        assertEquals("/", RequestPathCanonicalizer.canonicalize(""));
        assertEquals("/", RequestPathCanonicalizer.canonicalize(null));
        assertEquals("/", RequestPathCanonicalizer.canonicalize("/"));
    }

    // -- escapes percent de segmentos de punto (%2e%2e) ----------------------

    @Test
    void encodedDoubleDotSegmentsAreDecodedAndThenResolved() {
        // "%2e%2e" se decodifica a ".." ANTES de resolver segmentos, así que la
        // ruta queda igual que si el cliente hubiera escrito ".." a secas: el
        // "api" previo se descarta y "admin" sigue visible para las reglas.
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/%2e%2e/api/v1/territories/admin/manzanas"));
    }

    @Test
    void encodedDoubleDotCannotEscapeAboveRoot() {
        // Igual que con los ".." literales: un "%2e%2e" decodificado por encima
        // de la raíz se descarta en vez de atacar hacia atrás; dejar la ruta
        // corta nunca relaja una regla.
        assertEquals("/api/v1/reports",
                RequestPathCanonicalizer.canonicalize("/%2e%2e/%2e%2e/%2e%2e/api/v1/reports"));
    }

    @Test
    void encodedDoubleDotAcceptsUppercaseHexDigits() {
        // hexValue acepta 0-9, a-f y A-F: "%2E%2E" y "%2e%2e" son el mismo byte
        // 0x2E ("."), así que las dos escrituras tienen que resolver igual.
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/%2E%2E/api/v1/territories/admin/manzanas"));
    }

    @Test
    void encodedDoubleDotBetweenPlainSegmentsResolvesLikeLiteralDoubleDot() {
        // Un "%2e%2e" en medio de la ruta participa en la resolución igual que
        // un ".." literal: quita "territories" y el ".." siguiente quita
        // "admin", así que "manzanas" cuelga de "/api/v1".
        assertEquals("/api/v1/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/v1/territories/%2e%2e/admin/../manzanas"));
    }

    @Test
    void encodedDoubleDotKeepsAdminVisibleWhenAdminIsRestoredAfterwards() {
        // Espejo de "/api/v1/territories/admin/../admin/manzanas" del filtro
        // reactivo (WRITINGS_OF_THE_ADMIN_RULE del ReactiveSessionAuthFilterTest):
        // el ".." codificado quita el "admin" literal y el "admin" siguiente lo
        // restaura, de modo que la regla de admin sigue viendo el segmento.
        assertEquals("/api/v1/territories/admin/manzanas",
                RequestPathCanonicalizer.canonicalize("/api/v1/territories/admin/%2e%2e/admin/manzanas"));
    }

    // -- escapes mal formados ------------------------------------------------

    @Test
    void truncatedEscapeIsRejected() {
        // Solo queda un dígito hexadecimal: no hay byte que decodificar.
        assertThrows(IllegalArgumentException.class,
                () -> RequestPathCanonicalizer.canonicalize("/api/v1/territories/%6"));
    }

    @Test
    void nonHexEscapeIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> RequestPathCanonicalizer.canonicalize("/api/v1/territories/%zzmanzanas"));
    }

    @Test
    void trailingPercentIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> RequestPathCanonicalizer.canonicalize("/api/v1/reports%"));
    }

    // -- equivalencia: el punto de H4 ----------------------------------------

    @Test
    void everyObfuscatedFormCanonicalizesToTheSameAdminPath() {
        String canonical = RequestPathCanonicalizer.canonicalize("/api/v1/territories/admin/manzanas");

        assertEquals(canonical, RequestPathCanonicalizer.canonicalize("/api/v1/territories/%61dmin/manzanas"));
        assertEquals(canonical, RequestPathCanonicalizer.canonicalize("/api/v1/territories//admin/manzanas"));
        assertEquals(canonical, RequestPathCanonicalizer.canonicalize("/api/v1/territories/admin/./manzanas"));
        assertEquals(canonical, RequestPathCanonicalizer.canonicalize("/api/v1/territories/a%64min/manzanas"));
    }
}