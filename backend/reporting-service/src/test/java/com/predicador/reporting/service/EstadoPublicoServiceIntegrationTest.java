package com.predicador.reporting.service;

import com.predicador.reporting.ReportingServiceApp;
import com.predicador.reporting.dto.EstadoTerritorioPublico;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
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
 * Estado público de territorios contra PostgreSQL real (usa DISTINCT ON).
 * Run: {@code mvn -pl reporting-service test -Dtest=EstadoPublicoServiceIntegrationTest -Ddocker.available=true}
 */
@SpringBootTest(classes = ReportingServiceApp.class)
@Transactional
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class EstadoPublicoServiceIntegrationTest {

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

    @Autowired private ReportRepository repository;
    @Autowired private EstadoPublicoService service;

    private void reporte(long territorio, String fecha, String estado, String ids, String parcial) {
        Report r = new Report();
        r.setTerritorioNumero(territorio);
        r.setFecha(Instant.parse(fecha));
        r.setEstado(estado);
        r.setManzanasIds(ids);
        r.setGeometriaParcial(parcial);
        r.setEncargadoNombre("Nombre que no debe salir");
        r.setManzanasMarcadas(ids == null ? 0 : ids.split(",").length);
        r.setTotalManzanas(4);
        repository.saveAndFlush(r);
    }

    @Test
    void devuelveElUltimoReporteDeCadaTerritorioYSuUltimoCompletado() {
        reporte(1, "2026-08-01T10:00:00Z", "completed", "a,b,c,d", null);
        reporte(1, "2026-09-10T10:00:00Z", "incomplete", "a,b", "{\"type\":\"Polygon\",\"coordinates\":[]}");
        reporte(2, "2026-09-05T10:00:00Z", "incomplete", "x", null);

        List<EstadoTerritorioPublico> estados = service.estados();

        assertThat(estados).extracting(EstadoTerritorioPublico::territorio).containsExactly(1L, 2L);
        EstadoTerritorioPublico t1 = estados.get(0);
        assertThat(t1.ultimoTrabajo()).isEqualTo(Instant.parse("2026-09-10T10:00:00Z"));
        assertThat(t1.ultimoCompletado()).isEqualTo(Instant.parse("2026-08-01T10:00:00Z"));
        assertThat(t1.estado()).isEqualTo("incomplete");
        assertThat(t1.manzanasIds()).isEqualTo("a,b");
        assertThat(t1.geometriaParcial()).contains("Polygon");
        assertThat(estados.get(1).ultimoCompletado()).isNull();
        // El record no tiene campos de personas.
        assertThat(EstadoTerritorioPublico.class.getRecordComponents())
                .extracting(c -> c.getName())
                .noneMatch(n -> n.toLowerCase().contains("encargado"));
    }
}
