package com.predicador.territory.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.territory.model.ManzanaTerritorio;
import com.predicador.territory.repository.TerritoryRepository;
import com.predicador.territory.tile.S2BackfillService;
import com.predicador.territory.tile.TileProperties;
import com.predicador.territory.tile.TileService;
import com.predicador.territory.tile.WebMercator;
import io.github.sebasbaumh.mapbox.vectortile.VectorTile;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.MvtReader;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.TagKeyValueMapConverter;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.model.JtsLayer;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.model.JtsMvt;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.GeometryFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.zip.GZIPInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * End-to-end integration tests of the MVT pipeline (SPEC F1):
 * Flyway V3 → backfill S2 + dissolve → TileService render → MockMvc HTTP
 * round-trip → MvtReader decode → TileJSON.
 *
 * <p>Requires PostGIS and Docker.  Run with:
 * {@code mvn -pl territory-service test
 * -Dtest=TilePipelineIntegrationTest -Ddocker.available=true}</p>
 *
 * <p>Skipped automatically when Docker is not available (local dev or CI
 * without daemon).</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class TilePipelineIntegrationTest {

    static PostgreSQLContainer<?> postgis;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        postgis = new PostgreSQLContainer<>(
                DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("tile_test")
                .withUsername("test")
                .withPassword("test");
        postgis.start();

        registry.add("spring.datasource.url", postgis::getJdbcUrl);
        registry.add("spring.datasource.username", postgis::getUsername);
        registry.add("spring.datasource.password", postgis::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.flyway.baseline-on-migrate", () -> "true");
        registry.add("spring.flyway.baseline-version", () -> "0");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("spring.cloud.config.enabled", () -> "false");

        // SessionTokenService (strict=true sin perfil local) exige un secret
        // de ≥32 bytes UTF-8 al bootear el contexto — sin esto el arranque
        // lanza IllegalArgumentException al habilitar Docker en CI.
        registry.add("app.session.secret", () -> "test-session-secret-0123456789ABCDEF0123");

        // app.tiles: constructor binding en TileProperties (record).
        registry.add("app.tiles.max-zoom", () -> "19");
        registry.add("app.tiles.s2-level", () -> "14");
        registry.add("app.tiles.s2-z-min", () -> "12");
        registry.add("app.tiles.extent", () -> "4096");
        registry.add("app.tiles.buffer", () -> "64");
        registry.add("app.tiles.cache-max-size", () -> "500");
        registry.add("app.tiles.cache-ttl", () -> "10m");
        registry.add("app.tiles.write-listener-pool-size", () -> "2");
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private TileProperties props;
    @Autowired private S2BackfillService backfill;
    @Autowired private TerritoryRepository territoryRepo;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TileService tileService;

    // ────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────

    private static final String MVT_MEDIA = "application/vnd.mapbox-vector-tile";

    /** Tile z14 que contiene (-70.65, -33.45) — Chile central. */
    private static final int Z14 = 14;
    private static final int X14 = 4976;
    private static final int Y14 = 9809;

    private void persistManzana(long id, long territorio, String bloque, String ringWkt) {
        ManzanaTerritorio m = new ManzanaTerritorio();
        m.setId(id);
        m.setTerritorioPadre(territorio);
        m.setNombreBloque(bloque);
        m.setGeometry("SRID=4326;POLYGON ((" + ringWkt + "))");
        territoryRepo.save(m);
    }

    private void reRunBackfill() {
        jdbc.update("DELETE FROM app_meta WHERE k = 's2_backfill_done'");
        backfill.runBackfill();
    }

    private static int lonToTileX(double lon, int z) {
        return (int) Math.floor((lon + 180.0) / 360.0 * (1 << z));
    }

    private static int latToTileY(double lat, int z) {
        double latRad = Math.toRadians(lat);
        double n = 1 << z;
        return (int) Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    }

    private static byte[] gunzipBytes(byte[] data) throws IOException {
        try (var in = new GZIPInputStream(new ByteArrayInputStream(data))) {
            return in.readAllBytes();
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // 1. Flyway V3 + TileProperties binding
    // ────────────────────────────────────────────────────────────────────

    @Test
    void flywayV3Applied_andTilePropertiesBound() {
        Integer tablesCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_name IN ('manzana_s2_cover', 'territorio_disuelto', 'app_meta')
                """, Integer.class);
        assertThat(tablesCount).isEqualTo(3);

        Integer dataVersion = jdbc.queryForObject(
                "SELECT v FROM app_meta WHERE k = 'data_version'", Integer.class);
        assertThat(dataVersion).isEqualTo(1);

        assertThat(props.maxZoom()).isEqualTo(19);
        assertThat(props.s2Level()).isEqualTo(14);
        assertThat(props.s2ZMin()).isEqualTo(12);
        assertThat(props.extent()).isEqualTo(4096);
    }

    // ────────────────────────────────────────────────────────────────────
    // 2. Backfill populates covers + dissolved + is idempotent
    // ────────────────────────────────────────────────────────────────────

    @Test
    void backfillPopulatesCoversAndDissolved_idempotent() {
        persistManzana(7000, 1, "1.a", "-70.66 -33.46, -70.64 -33.46, -70.64 -33.44, -70.66 -33.44, -70.66 -33.46");
        persistManzana(7001, 1, "1.b", "-70.62 -33.46, -70.60 -33.46, -70.60 -33.44, -70.62 -33.44, -70.62 -33.46");
        persistManzana(7002, 2, "2.a", "-70.58 -33.46, -70.56 -33.46, -70.56 -33.44, -70.58 -33.44, -70.58 -33.46");

        reRunBackfill();

        Integer coversCount = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT manzana_id) FROM manzana_s2_cover WHERE manzana_id IN (7000, 7001, 7002)",
                Integer.class);
        assertThat(coversCount).isEqualTo(3);

        Integer dissCount1 = jdbc.queryForObject(
                "SELECT total_manzanas FROM territorio_disuelto WHERE territorio_padre = 1", Integer.class);
        assertThat(dissCount1).isEqualTo(2);

        Integer dissCount2 = jdbc.queryForObject(
                "SELECT total_manzanas FROM territorio_disuelto WHERE territorio_padre = 2", Integer.class);
        assertThat(dissCount2).isEqualTo(1);

        // Idempotency: second run must not duplicate.
        reRunBackfill();
        Integer coversCount2 = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT manzana_id) FROM manzana_s2_cover WHERE manzana_id IN (7000, 7001, 7002)",
                Integer.class);
        assertThat(coversCount2).isEqualTo(3);
    }

    // ────────────────────────────────────────────────────────────────────
    // 3. Render tile + round-trip via MvtReader + MockMvc headers
    // ────────────────────────────────────────────────────────────────────

    @Test
    void rendersTileAndRoundTripsThroughMvtReader() throws Exception {
        // Manzana that completely covers one z14 tile, ensuring ST_Intersects succeeds.
        int z = 14;
        Envelope tileBounds = WebMercator.tileBoundsLonLat(z, X14, Y14);
        String ring = tileBounds.getMinX() + " " + tileBounds.getMinY() + ", "
                + tileBounds.getMaxX() + " " + tileBounds.getMinY() + ", "
                + tileBounds.getMaxX() + " " + tileBounds.getMaxY() + ", "
                + tileBounds.getMinX() + " " + tileBounds.getMaxY() + ", "
                + tileBounds.getMinX() + " " + tileBounds.getMinY();
        persistManzana(7100, 10, "10.a", ring);
        reRunBackfill();

        String expectedEtag = "\"tile-14-" + X14 + "-" + Y14 + "-v1\"";

        MvcResult mvcResult = mockMvc.perform(get("/api/v1/territories/tiles/{z}/{x}/{y}.pbf", z, X14, Y14)
                        .accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MVT_MEDIA))
                .andExpect(header().string("Content-Encoding", "gzip"))
                .andExpect(header().string("Vary", "Accept-Encoding"))
                .andExpect(header().string("Cache-Control",
                        containsString("private")))
                .andExpect(header().string("Cache-Control",
                        containsString("max-age=300")))
                .andExpect(header().string("ETag", expectedEtag))
                .andReturn();

        // Decode raw protobuf.
        byte[] gzipped = mvcResult.getResponse().getContentAsByteArray();
        byte[] pbf = gunzipBytes(gzipped);
        VectorTile.Tile parsed = VectorTile.Tile.parseFrom(pbf);
        assertThat(parsed.getLayersCount()).isEqualTo(1);
        VectorTile.Tile.Layer layer = parsed.getLayers(0);
        assertThat(layer.getName()).isEqualTo("manzana");
        assertThat(layer.getFeaturesCount()).isGreaterThanOrEqualTo(1);
        // Sin ORDER BY en la query S2, el orden de features no está
        // garantizado (la manzana 7000 también intersecta este tile en el
        // mismo contexto de test) → assert independiente del orden.
        assertThat(layer.getFeaturesList()).anyMatch(feature -> feature.getId() == 7100L);

        // Round-trip via MvtReader JTS decoder (same jar as encoder).
        JtsMvt jts = MvtReader.loadMvt(new ByteArrayInputStream(pbf), new GeometryFactory(), new TagKeyValueMapConverter());
        JtsLayer manzanaLayer = jts.getLayer("manzana");
        assertThat(manzanaLayer).isNotNull();
        assertThat(manzanaLayer.getGeometries()).isNotEmpty();
        assertThat(manzanaLayer.getGeometries().iterator().next().isValid()).isTrue();
    }

    // ────────────────────────────────────────────────────────────────────
    // 4. Empty tile → valid MVT with 0 layers
    // ────────────────────────────────────────────────────────────────────

    @Test
    void emptyTile_returnsValidMvtWithNoLayers() throws Exception {
        // Tile en el Pacífico: no hay datos en esta ubicación.
        mockMvc.perform(get("/api/v1/territories/tiles/14/1000/1000.pbf").accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Encoding", "gzip"))
                .andExpect(header().string("ETag", "\"tile-14-1000-1000-v1\""))
                .andExpect(header().string("Cache-Control", containsString("private")))
                .andDo(result -> {
                    byte[] body = gunzipBytes(result.getResponse().getContentAsByteArray());
                    VectorTile.Tile tile = VectorTile.Tile.parseFrom(body);
                    assertThat(tile.getLayersCount()).isZero();
                });
    }

    // ────────────────────────────────────────────────────────────────────
    // 5. Strong ETag + 304 + ShallowEtagHeaderFilter exclusion
    // ────────────────────────────────────────────────────────────────────

    @Test
    void etagIsStrong_and304Works_whenShallowFilterExcluded() throws Exception {
        String expectedEtag = "\"tile-14-" + X14 + "-" + Y14 + "-v1\"";

        // First request: 200 with strong ETag (not weak W/"...").
        mockMvc.perform(get("/api/v1/territories/tiles/{z}/{x}/{y}.pbf", Z14, X14, Y14)
                        .accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", expectedEtag));

        // Second request with matching If-None-Match → 304.
        mockMvc.perform(get("/api/v1/territories/tiles/{z}/{x}/{y}.pbf", Z14, X14, Y14)
                        .accept(MVT_MEDIA)
                        .header("If-None-Match", expectedEtag))
                .andExpect(status().isNotModified())
                .andExpect(content().string(""));
    }

    // ────────────────────────────────────────────────────────────────────
    // 6. TileJSON exposes vector layers + real bounds
    // ────────────────────────────────────────────────────────────────────

    @Test
    void tileJson_exposesLayersAndRealBounds() throws Exception {
        persistManzana(7200, 20, "20.a",
                "-70.66 -33.46, -70.64 -33.46, -70.64 -33.44, -70.66 -33.44, -70.66 -33.46");
        reRunBackfill();

        MvcResult result = mockMvc.perform(get("/api/v1/territories/tiles.json"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/json"))
                .andExpect(jsonPath("$.tilejson").value("3.0.0"))
                .andExpect(jsonPath("$.minzoom").value(0))
                .andExpect(jsonPath("$.maxzoom").value(19))
                .andExpect(jsonPath("$.tiles[0]").value("/api/v1/territories/tiles/{z}/{x}/{y}.pbf"))
                .andExpect(jsonPath("$.vector_layers[?(@.id == 'manzana')]").exists())
                .andExpect(jsonPath("$.vector_layers[?(@.id == 'territorio')]").exists())
                .andReturn();

        // Bounds: real data → NOT the world fallback.
        JsonNode boundsNode = new ObjectMapper().readTree(result.getResponse().getContentAsString()).get("bounds");
        assertThat(boundsNode).isNotNull();
        assertThat(boundsNode.size()).isEqualTo(4);
        double minLon = boundsNode.get(0).asDouble();
        double minLat = boundsNode.get(1).asDouble();
        double maxLon = boundsNode.get(2).asDouble();
        double maxLat = boundsNode.get(3).asDouble();

        assertThat(minLon).isGreaterThan(-180.0);
        assertThat(maxLon).isLessThan(180.0);
        assertThat(minLon).isLessThan(maxLon);
        assertThat(minLat).isLessThan(maxLat);
    }

    // ────────────────────────────────────────────────────────────────────
    // 7. 400 for invalid coordinates
    // ────────────────────────────────────────────────────────────────────

    @Test
    void tile_400_invalidCoordinates() throws Exception {
        mockMvc.perform(get("/api/v1/territories/tiles/-1/0/0.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/territories/tiles/20/0/0.pbf").accept(MVT_MEDIA))
                .andExpect(status().isBadRequest());
    }

    // ────────────────────────────────────────────────────────────────────
    // 8. assignColor bumps version → tile reflects new color (F2)
    // ────────────────────────────────────────────────────────────────────

    @Test
    void assignColor_bumpsVersion_tileReflectsNewColor() throws Exception {
        // 1. Setup: persist manzana + backfill
        int z = 14;
        Envelope tileBounds = WebMercator.tileBoundsLonLat(z, X14, Y14);
        String ring = tileBounds.getMinX() + " " + tileBounds.getMinY() + ", "
                + tileBounds.getMaxX() + " " + tileBounds.getMinY() + ", "
                + tileBounds.getMaxX() + " " + tileBounds.getMaxY() + ", "
                + tileBounds.getMinX() + " " + tileBounds.getMaxY() + ", "
                + tileBounds.getMinX() + " " + tileBounds.getMinY();
        persistManzana(8000, 50, "50.a", ring);
        reRunBackfill();

        // 2. Render tile → ETag con versión V (v1)
        String expectedEtagV1 = "\"tile-14-" + X14 + "-" + Y14 + "-v1\"";
        mockMvc.perform(get("/api/v1/territories/tiles/{z}/{x}/{y}.pbf", z, X14, Y14)
                        .accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", expectedEtagV1));

        // 3. assignColor via MockMvc PUT
        String colorPayload = new ObjectMapper().writeValueAsString(
                new com.predicador.territory.dto.TerritoryColorRequest("#ff0000"));
        mockMvc.perform(put("/api/v1/territories/{number}/color", 50)
                        .contentType("application/json")
                        .content(colorPayload))
                .andExpect(status().isOk());

        // 4. Poll for async listener to bump version (up to 5s)
        long deadline = System.currentTimeMillis() + 5_000;
        Long version = 0L;
        while (version < 2L && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
            version = jdbc.queryForObject(
                    "SELECT v FROM app_meta WHERE k = 'data_version'", Long.class);
        }
        assertThat(version).as("data_version should be bumped to 2").isEqualTo(2L);

        // 5. Invalidate Caffeine cache to force rebuild
        tileService.invalidateCache();

        // 6. Render tile de nuevo → ETag con versión V+1 (v2)
        String expectedEtagV2 = "\"tile-14-" + X14 + "-" + Y14 + "-v2\"";
        MvcResult secondResult = mockMvc.perform(get("/api/v1/territories/tiles/{z}/{x}/{y}.pbf", z, X14, Y14)
                        .accept(MVT_MEDIA))
                .andExpect(status().isOk())
                .andExpect(header().string("ETag", expectedEtagV2))
                .andReturn();

        // 7. Decode MVT y verificar que el color #ff0000 aparece en la feature
        byte[] gzipped = secondResult.getResponse().getContentAsByteArray();
        byte[] pbf = gunzipBytes(gzipped);
        VectorTile.Tile parsed = VectorTile.Tile.parseFrom(pbf);
        assertThat(parsed.getLayersCount()).isEqualTo(1);
        VectorTile.Tile.Layer layer = parsed.getLayers(0);
        assertThat(layer.getName()).isEqualTo("manzana");
        assertThat(layer.getFeaturesCount()).isGreaterThanOrEqualTo(1);

        // Buscar la feature con id 8000 y verificar su tag "color"
        VectorTile.Tile.Feature feature = layer.getFeaturesList().stream()
                .filter(f -> f.getId() == 8000L)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Feature id=8000 not found in tile"));

        // Los tags son pares de índices enteros alternados en la lista
        // feature.getTagsList() → [keyIdx, valueIdx, keyIdx, valueIdx, ...]
        // que referencian layer.getKeysList() y layer.getValuesList()
        List<Integer> tags = feature.getTagsList();
        List<VectorTile.Tile.Value> layerValues = layer.getValuesList();
        List<String> layerKeys = layer.getKeysList();
        boolean foundColor = false;
        for (int i = 0; i < tags.size(); i += 2) {
            int keyIdx = tags.get(i);
            int valueIdx = tags.get(i + 1);
            String keyName = layerKeys.get(keyIdx);
            if ("color".equals(keyName)) {
                assertThat(layerValues.get(valueIdx).getStringValue()).isEqualTo("#ff0000");
                foundColor = true;
                break;
            }
        }
        assertThat(foundColor).as("Feature should have a 'color' property").isTrue();
    }
}