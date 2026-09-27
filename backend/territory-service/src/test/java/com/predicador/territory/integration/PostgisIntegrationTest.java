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
 * Integration tests that verify PostGIS geometry persistence and spatial
 * query behavior against a real PostgreSQL/PostGIS database via Testcontainers.
 *
 * <p>H2 cannot represent {@code geometry(GeometryZ,4326)} columns, so these
 * tests only run when Docker is available. They exercise the Flyway schema
 * migrations, JPA entity mapping, and repository queries that depend on
 * real PostGIS support.</p>
 *
 * <p>Run with: {@code mvn -pl territory-service test
 * -Dtest=PostgisIntegrationTest -Ddocker.available=true}</p>
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

    @Autowired
    private TerritoryRepository territoryRepository;

    @Autowired
    private JdbcTemplate jdbc;

    /**
     * Los métodos comparten contexto Spring y la misma BD (contenedor
     * estático): limpia la tabla antes de cada test para que las aserciones
     * (p. ej. findDistinctTerritorioPadres → containsExactlyInAnyOrder)
     * no dependan del orden de ejecución.
     */
    @BeforeEach
    void deleteAllManzanas() {
        jdbc.update("DELETE FROM manzanas_territorio");
    }

    /**
     * Alta de manzana vía SQL: Hibernate no puede vincular String→geometry
     * (emite el parámetro como varchar y PostGIS lo rechaza) y en
     * producción las geometrías tampoco se guardan vía Hibernate. ST_Force3D
     * garantiza la Z que exige la columna geometry(GeometryZ,4326).
     */
    private void insertManzana(long id, long territorioPadre, String nombreBloque, String ewkt) {
        jdbc.update("""
                INSERT INTO manzanas_territorio (id, territorio_padre, nombre_bloque, geometry)
                VALUES (?, ?, ?, ST_Force3D(ST_GeomFromEWKT(?)))
                """, id, territorioPadre, nombreBloque, ewkt);
    }

    @Test
    void contextLoads() {
        assertThat(territoryRepository).isNotNull();
    }

    @Test
    void persistsAndRetrievesManzanaWithGeometry() {
        insertManzana(1L, 10L, "Manzana A",
                "SRID=4326;POLYGON Z ((-70.65 -33.45 0, -70.64 -33.45 0, -70.64 -33.44 0, -70.65 -33.44 0, -70.65 -33.45 0))");

        Optional<ManzanaTerritorio> found = territoryRepository.findById(1L);
        assertThat(found).isPresent();
        assertThat(found.get().getNombreBloque()).isEqualTo("Manzana A");
        assertThat(found.get().getGeometry()).isNotNull();
    }

    @Test
    void findsManzanasByTerritorioPadre() {
        insertManzana(100L, 5L, "Bloque 1", "SRID=4326;POINT Z (-70.65 -33.45 0)");
        insertManzana(101L, 5L, "Bloque 2", "SRID=4326;POINT Z (-70.64 -33.44 0)");
        insertManzana(102L, 6L, "Bloque 3", "SRID=4326;POINT Z (-70.63 -33.43 0)");

        List<ManzanaTerritorio> result = territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(5L);
        assertThat(result).hasSize(2);
        assertThat(result).extracting(ManzanaTerritorio::getNombreBloque)
                .containsExactly("Bloque 1", "Bloque 2");
    }

    @Test
    void findsDistinctTerritorioPadres() {
        insertManzana(200L, 10L, "A", "SRID=4326;POINT Z (-70.65 -33.45 0)");
        insertManzana(201L, 20L, "B", "SRID=4326;POINT Z (-70.64 -33.44 0)");
        insertManzana(202L, 10L, "C", "SRID=4326;POINT Z (-70.63 -33.43 0)");

        List<Long> padres = territoryRepository.findDistinctTerritorioPadres();
        assertThat(padres).containsExactlyInAnyOrder(10L, 20L);
    }

    @Test
    void geometryColumnSupportsPostGisSpatialTypes() {
        insertManzana(300L, 15L, "Spatial Test",
                "SRID=4326;LINESTRING Z (-70.65 -33.45 100, -70.64 -33.44 200)");

        Optional<ManzanaTerritorio> found = territoryRepository.findById(300L);
        assertThat(found).isPresent();
        assertThat(found.get().getGeometry()).isNotNull();
    }

    @Test
    void geoJsonProjection_producesStAsGeoJsonPolygon() {
        insertManzana(400L, 30L, "30.a",
                "SRID=4326;POLYGON ((-70.65 -33.45, -70.64 -33.45, -70.64 -33.44, -70.65 -33.44, -70.65 -33.45))");

        List<TerritoryRepository.ManzanaGeoJsonProjection> rows =
                territoryRepository.findGeoJsonByTerritorioPadre(30L);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getId()).isEqualTo(400L);
        assertThat(rows.get(0).getTerritorioPadre()).isEqualTo(30L);
        assertThat(rows.get(0).getNombreBloque()).isEqualTo("30.a");
        assertThat(rows.get(0).getGeoJson()).contains("\"type\":\"Polygon\"");
    }

    @Test
    void geoJsonProjection_returnsAllTerritories() {
        insertManzana(500L, 40L, "40.a", "SRID=4326;POINT (-70.65 -33.45)");
        insertManzana(501L, 50L, "50.a", "SRID=4326;POINT (-70.64 -33.44)");

        List<TerritoryRepository.ManzanaGeoJsonProjection> rows =
                territoryRepository.findAllGeoJsonGroupedByTerritorio();
        assertThat(rows).extracting(TerritoryRepository.ManzanaGeoJsonProjection::getTerritorioPadre)
                .contains(40L, 50L);
    }
}
