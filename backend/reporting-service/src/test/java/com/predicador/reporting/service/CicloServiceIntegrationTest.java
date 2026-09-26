package com.predicador.reporting.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.reporting.ReportingServiceApp;
import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.dto.EstadoTerritorioPublico;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ciclos y correcciones contra PostGIS real, con las migraciones de Flyway
 * (V7 crea {@code ciclo_territorios} y abre el primer ciclo).
 * Run: {@code mvn -pl reporting-service test -Dtest=CicloServiceIntegrationTest -Ddocker.available=true}
 */
@SpringBootTest(classes = ReportingServiceApp.class)
@Transactional
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class CicloServiceIntegrationTest {

    static PostgreSQLContainer<?> postgres;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        postgres = new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("reporting_test")
                .withUsername("test")
                .withPassword("test");
        postgres.start();
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.flyway.url", postgres::getJdbcUrl);
        registry.add("spring.flyway.user", postgres::getUsername);
        registry.add("spring.flyway.password", postgres::getPassword);
        registry.add("spring.cloud.config.enabled", () -> "false");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "false");
        registry.add("app.session.secret", () -> "test-session-secret-32bytes-abcdefghijkl");
    }

    @Autowired private ReportRepository repository;
    @Autowired private CicloService service;
    @Autowired private EstadoPublicoService estadoPublico;
    @Autowired private JdbcClient jdbc;

    /** En una base vacía la migración abre el ciclo "ahora": se lo lleva antes de los reportes de prueba. */
    @BeforeEach
    void cicloDesdeEnero() {
        jdbc.sql("UPDATE ciclo_territorios SET inicio = '2026-01-01T00:00:00Z' WHERE fin IS NULL").update();
    }

    private void salida(long territorio, String fecha, String encargado, String estado, String ids) {
        Report r = new Report();
        r.setTerritorioNumero(territorio);
        r.setFecha(Instant.parse(fecha));
        r.setSessionTime(fecha);
        r.setEstado(estado);
        r.setManzanasIds(ids);
        r.setEncargadoNombre(encargado);
        r.setEncargadoApellido("Pérez");
        r.setManzanasMarcadas(ids.split(",").length);
        r.setTotalManzanas(3);
        repository.saveAndFlush(r);
    }

    private EstadoTerritorioPublico estado(long territorio) {
        return estadoPublico.estados().stream().filter(e -> e.territorio() == territorio).findFirst().orElseThrow();
    }

    @Test
    void hayUnCicloAbiertoDesdeLaMigracion() {
        List<CicloDto> ciclos = service.listar();
        assertThat(ciclos).hasSize(1);
        assertThat(ciclos.get(0).fin()).isNull();
    }

    @Test
    void cerrarGuardaElResumenYReiniciaSinBorrarElHistorial() throws Exception {
        salida(1, "2026-09-01T10:00:00Z", "Ana", "incomplete", "1-1.a");
        salida(1, "2026-09-08T10:00:00Z", "Luis", "completed", "1-1.a,1-1.b,1-1.c");
        salida(2, "2026-09-10T10:00:00Z", "Ana", "incomplete", "2-2.a");
        long antes = repository.count();

        CicloDto nuevo = service.cerrar("Visita del superintendente");

        assertThat(nuevo.fin()).isNull();
        List<CicloDto> ciclos = service.listar();
        assertThat(ciclos).hasSize(2);
        CicloDto cerrado = ciclos.get(1);
        assertThat(cerrado.fin()).isNotNull();
        assertThat(cerrado.nota()).isEqualTo("Visita del superintendente");

        JsonNode resumen = new ObjectMapper().readTree(cerrado.resumen());
        assertThat(resumen).hasSize(2);
        JsonNode t1 = resumen.get(0);
        assertThat(t1.get("territorio").asLong()).isEqualTo(1);
        assertThat(t1.get("estado").asText()).isEqualTo("completed");
        assertThat(t1.get("completado")).hasSize(1);
        assertThat(t1.get("encargados").toString()).contains("Ana Pérez", "Luis Pérez");
        assertThat(resumen.get(1).get("estado").asText()).isEqualTo("incomplete");

        // Nada se borró: se agregó un reporte de reinicio por territorio.
        assertThat(repository.count()).isEqualTo(antes + 2);
        EstadoTerritorioPublico e1 = estado(1);
        assertThat(e1.estado()).isEqualTo(Report.ESTADO_REINICIADO);
        assertThat(e1.manzanasIds()).isNullOrEmpty();
        assertThat(e1.ultimoCompletado()).isEqualTo(Instant.parse("2026-09-08T10:00:00Z"));
    }

    @Test
    void cerrarDosVecesSeguidasNoDuplicaLosReinicios() {
        salida(1, "2026-09-01T10:00:00Z", "Ana", "incomplete", "1-1.a");
        service.cerrar(null);
        long despuesDelPrimero = repository.count();
        service.cerrar(null);
        assertThat(repository.count()).isEqualTo(despuesDelPrimero);
        assertThat(service.listar()).hasSize(3);
    }

    @Test
    void corregirDejaElNuevoEstadoComoUltimoReporte() {
        salida(3, "2026-09-01T10:00:00Z", "Ana", "completed", "3-3.a,3-3.b,3-3.c");

        Report r = service.corregir(new CorreccionRequest(3L, "3-3.a,3-3.c", null, null, 3, 2, "3.b se marcó por error"));

        assertThat(r.getOrigen()).isEqualTo(Report.ORIGEN_CORRECCION);
        assertThat(r.getEstado()).isEqualTo("incomplete");
        assertThat(r.getNota()).isEqualTo("3.b se marcó por error");
        EstadoTerritorioPublico e = estado(3);
        assertThat(e.manzanasIds()).isEqualTo("3-3.a,3-3.c");
        assertThat(e.estado()).isEqualTo("incomplete");
        assertThat(service.estadoActual(3)).get().satisfies(a -> {
            assertThat(a.origen()).isEqualTo(Report.ORIGEN_CORRECCION);
            assertThat(a.manzanasIds()).isEqualTo("3-3.a,3-3.c");
        });
        assertThat(service.estadoActual(99)).isEmpty();
    }
}
