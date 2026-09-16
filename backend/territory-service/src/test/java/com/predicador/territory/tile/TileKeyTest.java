package com.predicador.territory.tile;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Clave de caché y ETag fuerte de los tiles (SPEC §4.2:
 * {@code ETag: "tile-{z}-{x}-{y}-v{data_version}"}).
 */
class TileKeyTest {

    @Test
    void etag_followsSpecFormat() {
        assertThat(new TileKey(14, 4976, 9809, 1).etag())
                .isEqualTo("\"tile-14-4976-9809-v1\"");
        assertThat(new TileKey(0, 0, 0, 3).etag())
                .isEqualTo("\"tile-0-0-0-v3\"");
    }

    @Test
    void etag_isStrong() {
        // ETag fuerte: va entre comillas dobles sin prefijo W/.
        assertThat(new TileKey(12, 2048, 2048, 7).etag())
                .startsWith("\"")
                .doesNotStartWith("W/");
    }

    @Test
    void constructor_rejectsNegativeCoordinates() {
        assertThatThrownBy(() -> new TileKey(-1, 0, 0, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TileKey(1, -1, 0, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TileKey(1, 0, -1, 1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void constructor_acceptsZeroCoordinates_andAnyVersion() {
        assertThat(new TileKey(0, 0, 0, Long.MAX_VALUE).etag()).isNotNull();
    }
}