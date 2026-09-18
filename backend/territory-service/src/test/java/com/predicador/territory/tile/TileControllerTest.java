package com.predicador.territory.tile;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static com.predicador.territory.tile.TestGzip.gzip;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Validaciones HTTP del controlador MVT (SPEC §4.2, §4.3): 400 para
 * coordenadas inválidas, cabeceras correctas en 200, 304 condicional,
 * alias x-protobuf y navegación a tiles.json.
 *
 * <p>MockMvc standalone: no arranca el contexto Spring completo, solo el
 * controlador — veloz y sin dependencias de BD o config.</p>
 */
@ExtendWith(MockitoExtension.class)
class TileControllerTest {

    private static final String MVT_MEDIA = "application/vnd.mapbox-vector-tile";
    private static final String X_PROTOBUF_MEDIA = "application/x-protobuf";
    private static final String STRONG_ETAG = "\"tile-14-4976-9809-v1\"";
    private static final int Z = 14;
    private static final int X = 4976;
    private static final int Y = 9809;

    private MockMvc mockMvc;

    @Mock
    private TileService tileService;

    @Mock
    private TileJsonService tileJsonService;

    @BeforeEach
    void setUp() {
        TileProperties props = new TileProperties(19, 14, 12, 4096, 64, 100, Duration.ofMinutes(10), 2);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new TileController(tileService, tileJsonService, props))
                .build();
    }

    // ---- 200 con cabeceras correctas ---------------------------------

    @Test
    void tile_200_gzipWithStrongEtagAndPrivateCache() throws Exception {
        byte[] gz = gzip(new byte[]{1, 2, 3});
        when(tileService.render(Z, X, Y)).thenReturn(new TileEntry(STRONG_ETAG, gz));

        mockMvc.perform(get("/api/v1/territories/tiles/14/4976/9809.pbf")
                        .accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MVT_MEDIA))
                .andExpect(header().string(HttpHeaders.CONTENT_ENCODING, "gzip"))
                .andExpect(header().string(HttpHeaders.ETAG, STRONG_ETAG))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.containsString("private"),
                                org.hamcrest.Matchers.containsString("max-age=300"))))
                .andExpect(header().string(HttpHeaders.VARY, HttpHeaders.ACCEPT_ENCODING))
                .andExpect(content().bytes(gz));
    }

    @Test
    void tile_acceptsXProtobufAlias() throws Exception {
        byte[] gz = gzip(new byte[]{9});
        when(tileService.render(Z, X, Y)).thenReturn(new TileEntry(STRONG_ETAG, gz));

        mockMvc.perform(get("/api/v1/territories/tiles/14/4976/9809.pbf")
                        .accept(X_PROTOBUF_MEDIA))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MVT_MEDIA));
    }

    // ---- 304 condicional ------------------------------------------------

    @Test
    void tile_ifNoneMatchSameEtag_returns304NoBody() throws Exception {
        when(tileService.render(Z, X, Y))
                .thenReturn(new TileEntry(STRONG_ETAG, gzip(new byte[]{1})));

        mockMvc.perform(get("/api/v1/territories/tiles/14/4976/9809.pbf")
                        .accept(MVT_MEDIA)
                        .header(HttpHeaders.IF_NONE_MATCH, STRONG_ETAG))
                .andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.ETAG, STRONG_ETAG)) // RFC 9110 §15.4.5
                .andExpect(header().doesNotExist(HttpHeaders.CONTENT_ENCODING))
                .andExpect(content().string(""));
    }

    @Test
    void tile_ifNoneMatchDifferentEtag_returnsFull200() throws Exception {
        when(tileService.render(Z, X, Y))
                .thenReturn(new TileEntry(STRONG_ETAG, gzip(new byte[]{1})));

        mockMvc.perform(get("/api/v1/territories/tiles/14/4976/9809.pbf")
                        .accept(MVT_MEDIA)
                        .header(HttpHeaders.IF_NONE_MATCH, "\"tile-14-4976-9809-v999\""))
                .andExpect(status().isOk());
    }

    // ---- 400 para coordenadas inválidas ---------------------------------

    @Test
    void tile_400_invalidCoordinates() throws Exception {
        // z negativo
        mockMvc.perform(get("/api/v1/territories/tiles/-1/0/0.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
        // z > maxZoom (19)
        mockMvc.perform(get("/api/v1/territories/tiles/20/0/0.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
        // x = 2^z (fuera de rango: [0, 2^z))
        mockMvc.perform(get("/api/v1/territories/tiles/14/16384/0.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
        // y negativo
        mockMvc.perform(get("/api/v1/territories/tiles/14/0/-1.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
        // y = 2^z
        mockMvc.perform(get("/api/v1/territories/tiles/14/0/16384.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(tileService);
    }

    // ---- tiles.json (TileJSON) ------------------------------------------

    @Test
    void tileJson_200_validTileJson3Document() throws Exception {
        TileJson tj = new TileJson(
                "3.0.0", "territories", 0, 19,
                new double[]{-180, -85.05112877980659, 180, 85.05112877980659},
                List.of("/api/v1/territories/tiles/{z}/{x}/{y}.pbf"),
                List.of(
                        new TileJsonVectorLayer("manzana", Map.of("fid", "Number"), 12, 19),
                        new TileJsonVectorLayer("territorio", Map.of("tid", "Number"), 0, 11)),
                1L);
        when(tileJsonService.tileJson()).thenReturn(tj);

        mockMvc.perform(get("/api/v1/territories/tiles.json"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/json"))
                .andExpect(jsonPath("$.tilejson").value("3.0.0"))
                .andExpect(jsonPath("$.data_version").value(1))
                .andExpect(jsonPath("$.maxzoom").value(19))
                .andExpect(jsonPath("$.vector_layers[?(@.id == 'manzana')].minzoom")
                        .value(org.hamcrest.Matchers.hasItem(12)))
                .andExpect(jsonPath("$.vector_layers[?(@.id == 'territorio')].maxzoom")
                        .value(org.hamcrest.Matchers.hasItem(11)));
    }
}