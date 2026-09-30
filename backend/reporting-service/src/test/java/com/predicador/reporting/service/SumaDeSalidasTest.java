package com.predicador.reporting.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Report;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SumaDeSalidasTest {

    /** Territorio 5 con 3 manzanas; los reportes antiguos las nombran por su id numérico. */
    private static final Map<Long, String> CATALOGO = Map.of(501L, "5-5.a", 502L, "5-5.b", 503L, "5-5.c");

    private static Report ultimo(String estado, String manzanasIds, String puntosParciales) {
        Report r = new Report();
        r.setTerritorioNumero(5L);
        r.setEstado(estado);
        r.setManzanasIds(manzanasIds);
        r.setPuntosParciales(puntosParciales);
        return r;
    }

    private static ReportDto aporte(String manzanasIds, String puntosParciales) {
        return new ReportDto(null, null, null, "Ana", "Pérez", null, "incomplete", 5L,
                7L, 3, null, "parcial", null, puntosParciales, manzanasIds);
    }

    private static String cuadrado(double x) {
        return "{\"type\":\"Polygon\",\"coordinates\":[[[" + x + ",-37.5],[" + (x + 0.001) + ",-37.5],["
                + (x + 0.001) + ",-37.499],[" + x + ",-37.499],[" + x + ",-37.5]]]}";
    }

    /** Detalle v2 con una zona: manzana, lados y total de lados (null = app anterior, sin total). */
    private static String zona(String m, String lados, Integer total, double x) {
        return "{\"v\":2,\"zonas\":[{\"m\":\"" + m + "\",\"n\":\"b\",\"l\":[" + lados + "]"
                + (total == null ? "" : ",\"t\":" + total) + ",\"g\":" + cuadrado(x) + "}]}";
    }

    @Test
    void sumaLasManzanasDeOtroHermanoAunqueElTelefonoTengaUnaCopiaVieja() {
        var suma = SumaDeSalidas.sumar(ultimo("incomplete", "5-5.a", null), aporte("5-5.b", null), CATALOGO);

        assertThat(suma.enteras()).containsExactly("5-5.a", "5-5.b");
        assertThat(suma.completo()).isFalse();
        assertThat(suma.manzanasMarcadas()).isEqualTo(2);
    }

    @Test
    void losIdsNumericosDeReportesAntiguosNoSeCuentanDosVeces() {
        var suma = SumaDeSalidas.sumar(ultimo("incomplete", "501,502", null), aporte("5-5.a,5-5.c", null), CATALOGO);

        assertThat(suma.enteras()).containsExactly("5-5.a", "5-5.b", "5-5.c");
        assertThat(suma.completo()).isTrue();
        assertThat(suma.total()).isEqualTo(3);
    }

    @Test
    void trasCompletarseOReiniciarseEmpiezaUnaVueltaNueva() {
        for (String estado : List.of("completed", Report.ESTADO_REINICIADO)) {
            var suma = SumaDeSalidas.sumar(ultimo(estado, "5-5.a,5-5.b,5-5.c", null), aporte("5-5.b", null), CATALOGO);
            assertThat(suma.enteras()).as(estado).containsExactly("5-5.b");
            assertThat(suma.completo()).isFalse();
        }
    }

    @Test
    void sumarEsIdempotente_unaAppAnteriorQueMandaTodoTambienQuedaBien() {
        Report antes = ultimo("incomplete", "5-5.a", zona("5-5.b", "0", null, -73.3));
        var suma = SumaDeSalidas.sumar(antes, aporte("5-5.a", zona("5-5.b", "0", null, -73.3)), CATALOGO);

        assertThat(suma.enteras()).containsExactly("5-5.a");
        assertThat(suma.zonas()).singleElement().satisfies(z -> assertThat(z.l()).containsExactly(0));
    }

    @Test
    void lasCallesDeLaMismaManzanaSeUnenYSeVenLasDosFranjas() {
        var suma = SumaDeSalidas.sumar(ultimo("incomplete", "", zona("5-5.b", "0", 4, -73.3)),
                aporte("", zona("5-5.b", "2", 4, -73.2)), CATALOGO);

        SumaDeSalidas.Zona z = suma.zonas().get(0);
        assertThat(z.l()).containsExactly(0, 2);
        assertThat(z.g().path("type").asText()).isEqualTo("MultiPolygon");
        assertThat(z.g().path("coordinates").size()).isEqualTo(2);
    }

    @Test
    void siLaFranjaNuevaCubreALaAnteriorSeQuedaLaNueva() {
        var suma = SumaDeSalidas.sumar(ultimo("incomplete", "", zona("5-5.b", "0", 4, -73.3)),
                aporte("", zona("5-5.b", "0,1", 4, -73.2)), CATALOGO);

        SumaDeSalidas.Zona z = suma.zonas().get(0);
        assertThat(z.l()).containsExactly(0, 1);
        assertThat(z.g().path("type").asText()).isEqualTo("Polygon");
        assertThat(z.g().path("coordinates").get(0).get(0).get(0).decimalValue()).isEqualByComparingTo("-73.2");
    }

    @Test
    void unaManzanaEnteraNoGuardaCalles_yConTodasSusCallesPasaAEntera() {
        var entera = SumaDeSalidas.sumar(ultimo("incomplete", "", zona("5-5.b", "0", 4, -73.3)),
                aporte("5-5.b", null), CATALOGO);
        assertThat(entera.enteras()).containsExactly("5-5.b");
        assertThat(entera.zonas()).isEmpty();
        assertThat(entera.puntosParciales()).isNull();
        assertThat(entera.geometriaParcial()).isNull();

        var todas = SumaDeSalidas.sumar(ultimo("incomplete", "", zona("5-5.b", "0,1", 4, -73.3)),
                aporte("", zona("5-5.b", "2,3", 4, -73.2)), CATALOGO);
        assertThat(todas.enteras()).containsExactly("5-5.b");
        assertThat(todas.zonas()).isEmpty();
    }

    @Test
    void lasZonasDeTrazoLibreDeLaAppAnteriorSeConservanSinRepetirse() {
        Report antes = ultimo("incomplete", "", null);
        antes.setGeometriaParcial(cuadrado(-73.3));
        ReportDto conLaMisma = new ReportDto(null, null, null, "Ana", "Pérez", null, "incomplete", 5L,
                7L, 3, null, "parcial", cuadrado(-73.3), null, "");

        var suma = SumaDeSalidas.sumar(antes, conLaMisma, CATALOGO);

        assertThat(suma.zonas()).singleElement().satisfies(z -> assertThat(z.m()).isNull());
        assertThat(suma.geometriaParcial()).contains("Polygon");
    }

    @Test
    void elFormatoGuardadoEsElQueLeeLaApp() throws Exception {
        var suma = SumaDeSalidas.sumar(null, aporte("5-5.a", zona("5-5.c", "1", 4, -73.3)), CATALOGO);

        JsonNode detalle = SumaDeSalidas.JSON.readTree(suma.puntosParciales());
        assertThat(detalle.path("v").asInt()).isEqualTo(2);
        JsonNode z = detalle.path("zonas").get(0);
        assertThat(z.path("m").asText()).isEqualTo("5-5.c");
        assertThat(z.path("l").get(0).asInt()).isEqualTo(1);
        assertThat(z.path("t").asInt()).isEqualTo(4);
        assertThat(z.path("g").path("type").asText()).isEqualTo("Polygon");
        assertThat(suma.manzanasIds()).isEqualTo("5-5.a");
        assertThat(suma.manzanaId()).isEqualTo("5-5.a");
    }

    @Test
    void sinCatalogoUsaElTotalQueMandaLaApp() {
        var suma = SumaDeSalidas.sumar(ultimo("incomplete", "5-5.a,5-5.b", null), aporte("5-5.c", null), Map.of());

        assertThat(suma.total()).isEqualTo(3);
        assertThat(suma.completo()).isTrue();
    }
}
