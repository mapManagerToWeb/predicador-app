package com.predicador.territory.integration;

import com.predicador.territory.model.ManzanaTerritorio;
import com.predicador.territory.repository.TerritoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests that verify PostGIS behavior against a real
 * PostgreSQL/PostGIS database via Testcontainers.
 *
 * <p>H2 cannot represent {@code geometry(GeometryZ,4326)} columns, so these
 * tests only run when Docker is available. They exercise the Flyway schema
 * migrations and the repository queries (native {@code ST_AsGeoJSON}
 * projections, JPQL reads) that depend on real PostGIS support.</p>
 *
 * <p>Insertion is performed with the <strong>same native SQL used in
 * production</strong> ({@code ManzanaAdminService.insertar}:
 * {@code ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326))}). The entity's
 * {@code geometry} field is a plain {@code String} with no Hibernate spatial
 * type, so a JPA {@code save()} would bind the column as {@code varchar} and
 * fail; production only ever writes geometry through native SQL. See
 * {@code ManzanaTerritorio}.</p>
 *
 * <p>Run with: {@code mvn -pl territory-service test
 * -Dtest=PostgisIntegrationTest -Ddocker.available=true} (needs a working
 * Docker socket; on machines where Testcontainers cannot fetch Ryuk, add
 * {@code -DTESTCONTAINERS_RYUK_DISABLED=true}).</p>
 *
 * <p>Skip with: {@code mvn -pl territory-service test
 * -Dtest=PostgisIntegrationTest -Ddocker.available=false}</p>
 */
@SpringBootTest
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class PostgisIntegrationTest {

    static PostgreSQLContainer<?> postgis;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        postgis = new PostgreSQLContainer<>(
                DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("territory_test")
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
        registry.add("app.session.secret", () -> "integration-test-secret-0123456789abcdef");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("spring.cloud.config.enabled", () -> "false");
    }

    @Autowired
    private TerritoryRepository territoryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * Todos los tests comparten el mismo contenedor PostGIS, así que cada test
     * parte de una tabla vacía (mismo patrón que
     * {@code TerritoryAdminIntegrationTest.limpiar}).
     */
    @BeforeEach
    void limpiar() {
        jdbcTemplate.update("DELETE FROM manzanas_territorio");
    }

    /**
     * Inserta una manzana con el mismo SQL nativo que producción
     * ({@code ManzanaAdminService.insertar}): GeoJSON → {@code ST_GeomFromGeoJSON}
     * → {@code ST_SetSRID(...,4326)} → {@code ST_Force3D}.
     */
    private void insertarManzana(long id, long territorioPadre, String nombre, String geojson) {
        jdbcTemplate.update("""
                INSERT INTO manzanas_territorio (id, territorio_padre, nombre_bloque, geometry)
                VALUES (?, ?, ?, ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)))
                """, id, territorioPadre, nombre, geojson);
    }

    @Test
    void contextLoads() {
        assertThat(territoryRepository).isNotNull();
        assertThat(jdbcTemplate).isNotNull();
    }

    @Test
    void persistsAndRetrievesManzanaWithGeometry() {
        insertarManzana(1L, 10L, "Manzana A",
                "{\"type\":\"Polygon\",\"coordinates\":[[[-70.65,-33.45,0],[-70.64,-33.45,0],[-70.64,-33.44,0],[-70.65,-33.44,0],[-70.65,-33.45,0]]]}");

        Optional<ManzanaTerritorio> found = territoryRepository.findById(1L);
        assertThat(found).isPresent();
        assertThat(found.get().getNombreBloque()).isEqualTo("Manzana A");
        assertThat(found.get().getGeometry()).isNotNull();
    }

    @Test
    void findsManzanasByTerritorioPadre() {
        insertarManzana(100L, 5L, "Bloque 1", "{\"type\":\"Point\",\"coordinates\":[-70.65,-33.45,0]}");
        insertarManzana(101L, 5L, "Bloque 2", "{\"type\":\"Point\",\"coordinates\":[-70.64,-33.44,0]}");
        insertarManzana(102L, 6L, "Bloque 3", "{\"type\":\"Point\",\"coordinates\":[-70.63,-33.43,0]}");

        List<ManzanaTerritorio> result = territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(5L);
        assertThat(result).hasSize(2);
        assertThat(result).extracting(ManzanaTerritorio::getNombreBloque)
                .containsExactly("Bloque 1", "Bloque 2");
    }

    @Test
    void findsDistinctTerritorioPadres() {
        insertarManzana(200L, 10L, "A", "{\"type\":\"Point\",\"coordinates\":[-70.65,-33.45,0]}");
        insertarManzana(201L, 20L, "B", "{\"type\":\"Point\",\"coordinates\":[-70.64,-33.44,0]}");
        insertarManzana(202L, 10L, "C", "{\"type\":\"Point\",\"coordinates\":[-70.63,-33.43,0]}");

        List<Long> padres = territoryRepository.findDistinctTerritorioPadres();
        assertThat(padres).containsExactlyInAnyOrder(10L, 20L);
    }

    @Test
    void geometryColumnSupportsPostGisSpatialTypes() {
        insertarManzana(300L, 15L, "Spatial Test",
                "{\"type\":\"LineString\",\"coordinates\":[[-70.65,-33.45,100],[-70.64,-33.44,200]]}");

        Optional<ManzanaTerritorio> found = territoryRepository.findById(300L);
        assertThat(found).isPresent();
        assertThat(found.get().getGeometry()).isNotNull();
    }

    @Test
    void geoJsonProjection_producesStAsGeoJsonPolygon() {
        insertarManzana(400L, 30L, "30.a",
                "{\"type\":\"Polygon\",\"coordinates\":[[[-70.65,-33.45],[-70.64,-33.45],[-70.64,-33.44],[-70.65,-33.44],[-70.65,-33.45]]]}");

        List<TerritoryRepository.ManzanaGeoJsonProjection> rows =
                territoryRepository.findGeoJsonByTerritorioPadre(30L);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getTerritorioPadre()).isEqualTo(30L);
        assertThat(rows.get(0).getNombreBloque()).isEqualTo("30.a");
        assertThat(rows.get(0).getGeoJson()).contains("\"type\":\"Polygon\"");
    }

    @Test
    void geoJsonProjection_returnsAllTerritories() {
        insertarManzana(500L, 40L, "40.a", "{\"type\":\"Point\",\"coordinates\":[-70.65,-33.45]}");
        insertarManzana(501L, 50L, "50.a", "{\"type\":\"Point\",\"coordinates\":[-70.64,-33.44]}");

        List<TerritoryRepository.ManzanaGeoJsonProjection> rows =
                territoryRepository.findAllGeoJsonGroupedByTerritorio();
        assertThat(rows).extracting(TerritoryRepository.ManzanaGeoJsonProjection::getTerritorioPadre)
                .contains(40L, 50L);
    }
}
