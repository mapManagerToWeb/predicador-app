package com.predicador.territory.tile;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Envelope;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Geometría Web Mercator del pipeline xyz (SPEC §5.1).
 *
 * <p>Convención (fix 2026-09-17): el envelope en metros es EPSG:3857 real
 * (y = 0 en el ecuador, norte positivo). Antes el envelope usaba un eje y
 * desplazado con origen en el sur y {@code metersToLonLat} lo interpretaba
 * con origen en el norte → toda latitud quedaba espejada en el hemisferio
 * opuesto (tiles vacíos en producción).</p>
 */
class WebMercatorTest {

    private static final double EPS = 1e-6;

    @Test
    void worldWidth_isSpheroidEquatorialCircumference() {
        assertThat(WebMercator.WORLD_WIDTH).isEqualTo(2 * Math.PI * 6378137.0, within(1e-3));
    }

    @Test
    void z0TileEnvelope_spansWholeWorldIn3857Meters() {
        Envelope env = WebMercator.tileEnvelopeMeters(0, 0, 0);
        double half = WebMercator.WORLD_WIDTH / 2;
        assertThat(env.getMinX()).isEqualTo(-half);
        assertThat(env.getMaxX()).isEqualTo(half);
        assertThat(env.getMinY()).isEqualTo(-half);
        assertThat(env.getMaxY()).isEqualTo(half);
    }

    @Test
    void z1Tile000_isNorthwestQuadrant() {
        Envelope env = WebMercator.tileEnvelopeMeters(1, 0, 0);
        double half = WebMercator.WORLD_WIDTH / 2;
        // Cuadrante noroeste en EPSG:3857 absoluto: x negativo (oeste),
        // y positivo (hemisferio norte).
        assertThat(env.getMinX()).isEqualTo(-half);
        assertThat(env.getMaxX()).isEqualTo(0.0);
        assertThat(env.getMinY()).isEqualTo(0.0);
        assertThat(env.getMaxY()).isEqualTo(half);
    }

    @Test
    void z1Tile111_isSoutheastQuadrant() {
        Envelope env = WebMercator.tileEnvelopeMeters(1, 1, 1);
        double half = WebMercator.WORLD_WIDTH / 2;
        // Cuadrante sureste: x positivo (este), y < 0 (hemisferio sur).
        assertThat(env.getMinX()).isEqualTo(0.0);
        assertThat(env.getMaxX()).isEqualTo(half);
        assertThat(env.getMinY()).isEqualTo(-half);
        assertThat(env.getMaxY()).isEqualTo(0.0);
    }

    @Test
    void z0Bounds_areWorldClampedToMercatorLatitude() {
        Envelope env = WebMercator.tileBoundsLonLat(0, 0, 0);
        assertThat(env.getMinX()).isEqualTo(-180.0, within(EPS));
        assertThat(env.getMaxX()).isEqualTo(180.0, within(EPS));
        assertThat(env.getMinY()).isEqualTo(-WebMercator.MAX_LATITUDE, within(EPS));
        assertThat(env.getMaxY()).isEqualTo(WebMercator.MAX_LATITUDE, within(EPS));
    }

    @Test
    void tileBounds_areConsistentWithXToLonAndYToLat() {
        // Tile (2,1,1): lon [-90, 0], lat [0, 66.513...] (z2 divide en 4).
        Envelope env = WebMercator.tileBoundsLonLat(2, 1, 1);
        assertThat(env.getMinX()).isEqualTo(WebMercator.xToLon(2, 1), within(EPS)); // -90
        assertThat(env.getMaxX()).isEqualTo(WebMercator.xToLon(2, 2), within(EPS)); // 0
        assertThat(env.getMinY()).isEqualTo(WebMercator.yToLat(2, 2), within(EPS)); // 0
        assertThat(env.getMaxY()).isEqualTo(WebMercator.yToLat(2, 1), within(EPS));
    }

    @Test
    void yToLat_knownValues() {
        // Meridiano central en y=n/2 → lat 0.
        assertThat(WebMercator.yToLat(2, 2)).isEqualTo(0.0, within(EPS));
        // y=0 (borde norte) → clamp a +85.0511.
        assertThat(WebMercator.yToLat(2, 0)).isEqualTo(WebMercator.MAX_LATITUDE, within(EPS));
        // xToLon: columnas reparten 360° uniformemente.
        assertThat(WebMercator.xToLon(2, 0)).isEqualTo(-180.0, within(EPS));
        assertThat(WebMercator.xToLon(2, 3)).isEqualTo(90.0, within(EPS));
    }

    @Test
    void yToLat_clampsBeyondPoles() {
        assertThat(WebMercator.yToLat(0, -10)).isEqualTo(WebMercator.MAX_LATITUDE, within(EPS));
        assertThat(WebMercator.yToLat(0, 10)).isEqualTo(-WebMercator.MAX_LATITUDE, within(EPS));
    }

    // ─── Regresión del espejo de hemisferio (fix 2026-09-17) ─────────────

    @Test
    void santiagoTile_bounds_areInSouthernHemisphere() {
        // Tile z14 que contiene (-70.65, -33.45) — Chile central. Antes del
        // fix, el envelope en metros se espejaba a lat ~+33.4°N y las queries
        // SQL nunca intersectaban los features reales (tiles vacíos).
        Envelope env = WebMercator.tileBoundsLonLat(14, 4976, 9809);
        assertThat(env.getMinX()).isLessThan(env.getMaxX());
        assertThat(env.getMinY()).isLessThan(env.getMaxY());
        assertThat(env.getMinX()).isEqualTo(-70.65, within(0.05));
        assertThat(env.getMaxX()).isEqualTo(-70.65, within(0.05));
        assertThat(env.getMinY()).isEqualTo(-33.45, within(0.05));
        assertThat(env.getMaxY()).isEqualTo(-33.45, within(0.05));
        // Todo el tile queda al sur del ecuador.
        assertThat(env.getMaxY()).isLessThan(0.0);
    }

    @Test
    void metersToLonLat_roundTripsWithTileEnvelopeMeters() {
        // Para tiles en ambos hemisferios la composición
        // tileEnvelopeMeters → metersToLonLat debe devolver el mismo
        // envelope lon/lat que tileBoundsLonLat (regresión del espejo).
        for (int[] t : new int[][]{{0, 0, 0}, {1, 1, 1}, {8, 75, 156}, {12, 1213, 2507}, {14, 4976, 9809}}) {
            Envelope viaMeters = WebMercator.metersToLonLat(WebMercator.tileEnvelopeMeters(t[0], t[1], t[2]));
            Envelope direct = WebMercator.tileBoundsLonLat(t[0], t[1], t[2]);
            assertThat(viaMeters.getMinX()).as("minX tile %s", java.util.Arrays.toString(t))
                    .isEqualTo(direct.getMinX(), within(EPS));
            assertThat(viaMeters.getMaxX()).as("maxX tile %s", java.util.Arrays.toString(t))
                    .isEqualTo(direct.getMaxX(), within(EPS));
            assertThat(viaMeters.getMinY()).as("minY tile %s", java.util.Arrays.toString(t))
                    .isEqualTo(direct.getMinY(), within(EPS));
            assertThat(viaMeters.getMaxY()).as("maxY tile %s", java.util.Arrays.toString(t))
                    .isEqualTo(direct.getMaxY(), within(EPS));
        }
    }

    @Test
    void metersToLonLat_knownSouthernHemisphereValues() {
        // Tile z8 (75,156) ~ costa de Concepción: lat [−37.70, −36.59],
        // todo al sur del ecuador.
        Envelope env = WebMercator.metersToLonLat(WebMercator.tileEnvelopeMeters(8, 75, 156));
        assertThat(env.getMinY()).isLessThan(0.0);
        assertThat(env.getMaxY()).isLessThan(0.0);
        assertThat(env.getMinY()).isEqualTo(-37.70, within(0.05));
        assertThat(env.getMaxY()).isEqualTo(-36.59, within(0.05));
    }

    // ─── Regresión del eje x (fix 2026-09-18) ─────────────────────────────

    @Test
    void concepcionTile_envelope_containsPostGis3857Coordinates() {
        // Concepción, Chile (-73.44, -37.5). ST_Transform(geometry, 3857)
        // devuelve x NEGATIVA (~ -8.17e6 m, oeste del meridiano 0) e y
        // negativa (~ -4.51e6 m, sur del ecuador). Regresión: el envelope
        // del tile debe CONTENER ese punto — antes el eje x usaba la
        // posición de grilla TMS [0, WORLD_WIDTH] y el envelope quedaba
        // ~20.000 km al este (clip JTS vacío en producción).
        Envelope env = WebMercator.tileEnvelopeMeters(10, 303, 627);
        double x = WebMercator.WORLD_WIDTH * (106.56 / 360.0) - WebMercator.WORLD_WIDTH / 2.0; // lon -73.44
        double y = radius() * Math.log(Math.tan(Math.PI / 4 + Math.toRadians(-37.5) / 2));      // lat -37.5
        assertThat(x).isNegative();
        assertThat(y).isNegative();
        assertThat(env.contains(x, y))
                .as("tile z10/303/627 debe contener (-73.44, -37.5) en EPSG:3857")
                .isTrue();
    }

    @Test
    void metersToLonLat_absoluteEpsg3857X_noOffset() {
        // Lon -73.44 → x EPSG:3857 ≈ -8.1749e6 m (negativo). La conversión
        // inversa debe devolver -73.44 SIN aplicar el offset de ±180° que
        // duplicaba el desplazamiento de medio mundo.
        double x = WebMercator.WORLD_WIDTH * (106.56 / 360.0) - WebMercator.WORLD_WIDTH / 2.0;
        double y = radius() * Math.log(Math.tan(Math.PI / 4 + Math.toRadians(-37.5) / 2));
        Envelope env = WebMercator.metersToLonLat(new Envelope(x, x + 1000.0, y, y + 1000.0));
        assertThat(env.getMinX()).isEqualTo(-73.44, within(1e-6));
        assertThat(env.getMinY()).isEqualTo(-37.5, within(1e-6));
    }

    /** Radio terrestre WGS-84 (semieje mayor) = WORLD_WIDTH / 2π. */
    private static double radius() {
        return WebMercator.WORLD_WIDTH / (2.0 * Math.PI);
    }
}