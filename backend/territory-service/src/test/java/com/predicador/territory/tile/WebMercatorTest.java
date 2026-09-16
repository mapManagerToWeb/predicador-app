package com.predicador.territory.tile;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Envelope;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Geometría Web Mercator del pipeline xyz (SPEC §5.1).
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
        assertThat(env.getMinX()).isEqualTo(0.0);
        assertThat(env.getMaxX()).isEqualTo(WebMercator.WORLD_WIDTH);
        assertThat(env.getMinY()).isEqualTo(0.0);
        assertThat(env.getMaxY()).isEqualTo(WebMercator.WORLD_WIDTH);
    }

    @Test
    void z1Tile000_isNorthwestQuadrant() {
        Envelope env = WebMercator.tileEnvelopeMeters(1, 0, 0);
        double half = WebMercator.WORLD_WIDTH / 2;
        assertThat(env.getMinX()).isEqualTo(0.0);
        assertThat(env.getMaxX()).isEqualTo(half);
        assertThat(env.getMinY()).isEqualTo(half);
        assertThat(env.getMaxY()).isEqualTo(WebMercator.WORLD_WIDTH);
    }

    @Test
    void z1Tile111_isSoutheastQuadrant() {
        Envelope env = WebMercator.tileEnvelopeMeters(1, 1, 1);
        double half = WebMercator.WORLD_WIDTH / 2;
        assertThat(env.getMinX()).isEqualTo(half);
        assertThat(env.getMaxX()).isEqualTo(WebMercator.WORLD_WIDTH);
        assertThat(env.getMinY()).isEqualTo(0.0);
        assertThat(env.getMaxY()).isEqualTo(half);
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
}