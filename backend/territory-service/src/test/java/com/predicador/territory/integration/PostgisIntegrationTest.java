package com.predicador.territory.integration;

import com.predicador.territory.model.ManzanaTerritorio;
import com.predicador.territory.repository.TerritoryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
    }

    @Autowired
    private TerritoryRepository territoryRepository;

    @Test
    void contextLoads() {
        assertThat(territoryRepository).isNotNull();
    }

    @Test
    void persistsAndRetrievesManzanaWithGeometry() {
        ManzanaTerritorio manzana = new ManzanaTerritorio();
        manzana.setId(1L);
        manzana.setTerritorioPadre(10L);
        manzana.setNombreBloque("Manzana A");
        manzana.setGeometry("SRID=4326;POLYGON Z ((-70.65 -33.45 0, -70.64 -33.45 0, -70.64 -33.44 0, -70.65 -33.44 0, -70.65 -33.45 0))");

        territoryRepository.save(manzana);

        Optional<ManzanaTerritorio> found = territoryRepository.findById(1L);
        assertThat(found).isPresent();
        assertThat(found.get().getNombreBloque()).isEqualTo("Manzana A");
        assertThat(found.get().getGeometry()).contains("POLYGON Z");
    }

    @Test
    void findsManzanasByTerritorioPadre() {
        ManzanaTerritorio m1 = new ManzanaTerritorio();
        m1.setId(100L);
        m1.setTerritorioPadre(5L);
        m1.setNombreBloque("Bloque 1");
        m1.setGeometry("SRID=4326;POINT Z (-70.65 -33.45 0)");

        ManzanaTerritorio m2 = new ManzanaTerritorio();
        m2.setId(101L);
        m2.setTerritorioPadre(5L);
        m2.setNombreBloque("Bloque 2");
        m2.setGeometry("SRID=4326;POINT Z (-70.64 -33.44 0)");

        ManzanaTerritorio m3 = new ManzanaTerritorio();
        m3.setId(102L);
        m3.setTerritorioPadre(6L);
        m3.setNombreBloque("Bloque 3");
        m3.setGeometry("SRID=4326;POINT Z (-70.63 -33.43 0)");

        territoryRepository.saveAll(List.of(m1, m2, m3));

        List<ManzanaTerritorio> result = territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(5L);
        assertThat(result).hasSize(2);
        assertThat(result).extracting(ManzanaTerritorio::getNombreBloque)
                .containsExactly("Bloque 1", "Bloque 2");
    }

    @Test
    void findsDistinctTerritorioPadres() {
        ManzanaTerritorio m1 = new ManzanaTerritorio();
        m1.setId(200L);
        m1.setTerritorioPadre(10L);
        m1.setNombreBloque("A");
        m1.setGeometry("SRID=4326;POINT Z (-70.65 -33.45 0)");

        ManzanaTerritorio m2 = new ManzanaTerritorio();
        m2.setId(201L);
        m2.setTerritorioPadre(20L);
        m2.setNombreBloque("B");
        m2.setGeometry("SRID=4326;POINT Z (-70.64 -33.44 0)");

        ManzanaTerritorio m3 = new ManzanaTerritorio();
        m3.setId(202L);
        m3.setTerritorioPadre(10L);
        m3.setNombreBloque("C");
        m3.setGeometry("SRID=4326;POINT Z (-70.63 -33.43 0)");

        territoryRepository.saveAll(List.of(m1, m2, m3));

        List<Long> padres = territoryRepository.findDistinctTerritorioPadres();
        assertThat(padres).containsExactlyInAnyOrder(10L, 20L);
    }

    @Test
    void geometryColumnSupportsPostGisSpatialTypes() {
        ManzanaTerritorio manzana = new ManzanaTerritorio();
        manzana.setId(300L);
        manzana.setTerritorioPadre(15L);
        manzana.setNombreBloque("Spatial Test");
        manzana.setGeometry("SRID=4326;LINESTRING Z (-70.65 -33.45 100, -70.64 -33.44 200)");

        territoryRepository.save(manzana);

        Optional<ManzanaTerritorio> found = territoryRepository.findById(300L);
        assertThat(found).isPresent();
        assertThat(found.get().getGeometry()).contains("LINESTRING Z");
    }
}
