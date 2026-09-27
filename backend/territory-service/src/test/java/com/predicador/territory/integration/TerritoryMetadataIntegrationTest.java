package com.predicador.territory.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.territory.tile.DataVersionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end tests for {@code GET /api/v1/territories/metadata}
 * (f5-gps-mode-cwv-hardening, tareas 2.2–2.4): consulta PostGIS real
 * (ST_Extent / ST_Union / ST_PointOnSurface / json_agg), respuesta sin
 * geometría y caché claveada por {@code app_meta.data_version}.
 *
 * <p>Requires PostGIS and Docker. Run with:
 * {@code mvn -pl territory-service test
 * -Dtest=TerritoryMetadataIntegrationTest -Ddocker.available=true}</p>
 *
 * <p>Skipped automatically when Docker is not available.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class TerritoryMetadataIntegrationTest {

    static PostgreSQLContainer<?> postgis;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        postgis = new PostgreSQLContainer<>(
                DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("metadata_test")
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
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataVersionService dataVersionService;
    @Autowired private ObjectMapper objectMapper;

    /** Rango de territorios reservado por esta clase (otros tests usan 1–50). */
    private static final long T30 = 30L;
    private static final long T31 = 31L;
    private static final long T33 = 33L;

    private void persistManzana(long id, long territorio, String bloque, String ringWkt) {
        // The schema requires GeometryZ; bind WKT as text and convert explicitly in PostGIS.
        jdbc.update("""
                INSERT INTO manzanas_territorio (id, territorio_padre, nombre_bloque, geometry)
                VALUES (?, ?, ?, ST_Force3D(ST_GeomFromText(?, 4326)))
                """, id, territorio, bloque, "POLYGON ((" + ringWkt + "))");
    }

    /** Extrae el elemento del arreglo cuyo {@code numero} coincide. */
    private JsonNode entryByNumero(JsonNode array, long numero) {
        for (JsonNode node : array) {
            if (node.path("numero").asLong() == numero) {
                return node;
            }
        }
        throw new AssertionError("Territorio " + numero + " no encontrado en la respuesta");
    }

    /** {@code true} si el arreglo contiene una entrada con ese {@code numero}. */
    private boolean containsNumero(JsonNode array, long numero) {
        for (JsonNode node : array) {
            if (node.path("numero").asLong() == numero) {
                return true;
            }
        }
        return false;
    }

    // ────────────────────────────────────────────────────────────────────
    // 2.2 — Happy path con datos reales en PostGIS, sin geometría
    // ────────────────────────────────────────────────────────────────────

    @Test
    void metadata_returnsRealBoundsCenterCountAndFids_withoutGeometry() throws Exception {
        persistManzana(9000, T30, "30.a",
                "-71.5 -33.5, -71.3 -33.5, -71.3 -33.3, -71.5 -33.3, -71.5 -33.5");
        persistManzana(9001, T30, "30.b",
                "-71.48 -33.48, -71.46 -33.48, -71.46 -33.46, -71.48 -33.46, -71.48 -33.48");
        persistManzana(9010, T31, "31.a",
                "-70.9 -33.2, -70.8 -33.2, -70.8 -33.1, -70.9 -33.1, -70.9 -33.2");

        MvcResult result = mockMvc.perform(get("/api/v1/territories/metadata"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/json"))
                .andExpect(content().string(not(containsString("geometry"))))
                .andExpect(content().string(not(containsString("coordinates"))))
                .andReturn();

        JsonNode array = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(array.isArray()).isTrue();

        JsonNode t30 = entryByNumero(array, T30);
        assertThat(t30.path("nombre").asText()).isEqualTo("Territorio 30");
        assertThat(t30.path("color").asText()).isNotBlank();
        assertThat(t30.path("manzanaCount").asLong()).isEqualTo(2L);

        // bounds = ST_Extent real de los polígonos sembrados.
        JsonNode bounds = t30.path("bounds");
        assertThat(bounds.size()).isEqualTo(4);
        assertThat(bounds.get(0).asDouble()).isCloseTo(-71.5, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(bounds.get(1).asDouble()).isCloseTo(-33.5, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(bounds.get(2).asDouble()).isCloseTo(-71.3, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(bounds.get(3).asDouble()).isCloseTo(-33.3, org.assertj.core.data.Offset.offset(1e-6));

        // center = ST_PointOnSurface → dentro del bbox (nunca un centroid
        // fuera del polígono; el punto debe quedar dentro de los límites).
        JsonNode center = t30.path("center");
        assertThat(center.size()).isEqualTo(2);
        double lng = center.get(0).asDouble();
        double lat = center.get(1).asDouble();
        assertThat(lng).isGreaterThanOrEqualTo(-71.5).isLessThanOrEqualTo(-71.3);
        assertThat(lat).isGreaterThanOrEqualTo(-33.5).isLessThanOrEqualTo(-33.3);

        // fids = ids de manzanas_territorio (paridad con MVT feature id y
        // propiedad GeoJSON "fid"), orden ascendente.
        List<Long> fids = objectMapper.convertValue(t30.path("fids"),
                objectMapper.getTypeFactory().constructCollectionType(List.class, Long.class));
        assertThat(fids).containsExactly(9000L, 9001L);

        // Territorio sin traslape: conteo y fids propios.
        JsonNode t31 = entryByNumero(array, T31);
        assertThat(t31.path("manzanaCount").asLong()).isEqualTo(1L);
        List<Long> fidsT31 = objectMapper.convertValue(t31.path("fids"),
                objectMapper.getTypeFactory().constructCollectionType(List.class, Long.class));
        assertThat(fidsT31).containsExactly(9010L);
    }

    // ────────────────────────────────────────────────────────────────────
    // 2.3 — Caché claveada por data_version: recálculo tras bump
    // ────────────────────────────────────────────────────────────────────

    @Test
    void metadata_cacheServesSameVersion_thenRecomputesAfterVersionBump() throws Exception {
        persistManzana(9020, T31, "31.b",
                "-70.88 -33.18, -70.86 -33.18, -70.86 -33.16, -70.88 -33.16, -70.88 -33.18");

        // 1ª llamada: calcula y cachea bajo la versión vigente.
        MvcResult first = mockMvc.perform(get("/api/v1/territories/metadata"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode firstArray = objectMapper.readTree(first.getResponse().getContentAsString());
        assertThat(containsNumero(firstArray, T33))
                .as("Territorio 33 aún no existe → no debe estar en la respuesta cacheada")
                .isFalse();

        // Muta los datos y bumpea la versión como haría el write path (F2).
        persistManzana(9030, T33, "33.a",
                "-71.0 -33.0, -70.99 -33.0, -70.99 -32.99, -71.0 -32.99, -71.0 -33.0");
        dataVersionService.bumpVersion();

        // 2ª llamada: versión distinta → recálculo, no sirve la caché vieja.
        MvcResult second = mockMvc.perform(get("/api/v1/territories/metadata"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode secondArray = objectMapper.readTree(second.getResponse().getContentAsString());
        JsonNode t33 = entryByNumero(secondArray, T33);
        assertThat(t33.path("manzanaCount").asLong()).isEqualTo(1L);
        List<Long> fidsT33 = objectMapper.convertValue(t33.path("fids"),
                objectMapper.getTypeFactory().constructCollectionType(List.class, Long.class));
        assertThat(fidsT33).containsExactly(9030L);
    }
}
