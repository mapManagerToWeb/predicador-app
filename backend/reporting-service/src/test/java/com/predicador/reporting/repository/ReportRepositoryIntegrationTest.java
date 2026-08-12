package com.predicador.reporting.repository;

import com.predicador.reporting.ReportingServiceApp;
import com.predicador.reporting.model.Report;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifica la query nativa DISTINCT ON que alimenta el restore del mapa
 * (/reports/batch) contra PostgreSQL real.
 *
 * <p>H2 no soporta DISTINCT ON, así que este test solo corre con Docker
 * disponible. Run: {@code mvn -pl reporting-service test
 * -Dtest=ReportRepositoryIntegrationTest -Ddocker.available=true}</p>
 *
 * <p>Skip: {@code mvn -pl reporting-service test
 * -Dtest=ReportRepositoryIntegrationTest -Ddocker.available=false}</p>
 *
 * <p>Nota Boot 4: «@DataJpaTest» / «@AutoConfigureTestDatabase» dejaron de
 * estar en {@code spring-boot-test-autoconfigure} (se movieron a los módulos
 * {@code spring-boot-starter-data-jpa-test} / {@code spring-boot-starter-jdbc-test},
 * no declarados en el pom). Se usa {@link SpringBootTest} —mismo patrón que
 * {@code PostgisIntegrationTest}— y las propiedades de arranque se fijan vía
 * {@link DynamicPropertySource} (config/eureka desactivados, RabbitMQ sin
 * auto-start, {@code app.session.secret} de testing de 32+ bytes).</p>
 */
@SpringBootTest(classes = ReportingServiceApp.class)
@Transactional
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class ReportRepositoryIntegrationTest {

    static PostgreSQLContainer<?> postgres;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine")
                .withDatabaseName("reporting_test")
                .withUsername("test")
                .withPassword("test");
        postgres.start();

        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
        registry.add("spring.flyway.enabled", () -> "false");
        registry.add("spring.cloud.config.enabled", () -> "false");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "false");
        registry.add("app.session.secret", () -> "test-session-secret-32bytes-abcdefghijkl");
    }

    @Autowired
    private ReportRepository repository;

    private Report report(int id, Long territorio, Instant fecha, String estado, String manzanasIds) {
        Report r = new Report();
        r.setTerritorioNumero(territorio);
        r.setFecha(fecha);
        r.setEstado(estado);
        r.setManzanasIds(manzanasIds);
        r.setEncargadoNombre("Daniel");
        r.setEncargadoApellido("Uribe");
        return r;
    }

    @Test
    void returnsOnlyLatestReportPerTerritory() {
        repository.save(report(1, 1L, Instant.parse("2026-08-01T10:00:00Z"), "incomplete", "A,B"));
        repository.save(report(2, 1L, Instant.parse("2026-08-10T10:00:00Z"), "completed", "A,B,C"));
        repository.save(report(3, 2L, Instant.parse("2026-08-05T10:00:00Z"), "incomplete", "D"));
        repository.save(report(4, 2L, Instant.parse("2026-08-11T10:00:00Z"), "completed", "D,E"));

        List<Report> result = repository.findLatestByTerritorioNumeroIn(List.of(1L, 2L));

        assertThat(result).hasSize(2);
        assertThat(result).extracting(Report::getTerritorioNumero).containsExactly(1L, 2L);
        assertThat(result.get(0).getFecha()).isEqualTo(Instant.parse("2026-08-10T10:00:00Z"));
        assertThat(result.get(1).getFecha()).isEqualTo(Instant.parse("2026-08-11T10:00:00Z"));
        assertThat(result.get(0).getManzanasIds()).isEqualTo("A,B,C");
    }

    @Test
    void returnsOnlyRequestedTerritoriesWhenSubsetPassed() {
        repository.save(report(10, 3L, Instant.parse("2026-08-01T10:00:00Z"), "incomplete", "X"));
        repository.save(report(11, 3L, Instant.parse("2026-08-05T10:00:00Z"), "completed", "Y"));

        List<Report> result = repository.findLatestByTerritorioNumeroIn(List.of(2L, 3L));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTerritorioNumero()).isEqualTo(3L);
        assertThat(result.get(0).getManzanasIds()).isEqualTo("Y");
    }

    @Test
    void returnsEmptyWhenNoTerritoriesMatch() {
        assertThat(repository.findLatestByTerritorioNumeroIn(List.of(99L))).isEmpty();
    }

    @Test
    void findVersionsReturnsLastNonEmptyReportPerTerritory() {
        // Territorio 1: empty report (older) then non-empty (newer) -> version = id of the non-empty.
        repository.save(report(100, 1L, Instant.parse("2026-08-01T10:00:00Z"), "completed", null));
        repository.save(report(101, 1L, Instant.parse("2026-08-10T10:00:00Z"), "completed", "A,B,C"));
        // Territorio 2: two non-empty -> version = id of the one ordered last by fecha DESC, id DESC.
        repository.save(report(102, 2L, Instant.parse("2026-08-05T10:00:00Z"), "incomplete", "D"));
        repository.save(report(103, 2L, Instant.parse("2026-08-11T10:00:00Z"), "completed", "D,E"));

        List<Object[]> result = repository.findVersions(List.of(1L, 2L, 99L));

        assertThat(result).hasSize(2);
        assertThat(result).extracting(row -> ((Number) row[0]).longValue())
                .containsExactly(1L, 2L);
        assertThat(((Number) result.get(0)[1]).longValue()).isEqualTo(101L);
        assertThat(((Number) result.get(1)[1]).longValue()).isEqualTo(103L);
    }

    @Test
    void findVersionsExcludesTerritoriesWithOnlyEmptyReports() {
        repository.save(report(110, 9L, Instant.parse("2026-08-01T10:00:00Z"), "completed", null));
        repository.save(report(111, 9L, Instant.parse("2026-08-05T10:00:00Z"), "incomplete", ""));

        assertThat(repository.findVersions(List.of(9L))).isEmpty();
    }
}