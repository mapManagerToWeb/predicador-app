package com.predicador.reporting.integration;

import com.predicador.reporting.ReportingServiceApp;
import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.reporting.service.EncargadoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.UnexpectedRollbackException;
import org.testcontainers.containers.PostgreSQLContainer;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;

/**
 * Verifies that {@link EncargadoService#buscarOCrear} handles the concurrent
 * insert race condition correctly when two threads call it simultaneously with
 * the same (nombre, apellido).
 *
 * <p>Without the {@code @Transactional(noRollbackFor =
 * DataIntegrityViolationException.class)} fix on {@code crear()}, one of the
 * two concurrent threads would throw {@link UnexpectedRollbackException} because
 * the constraint violation would mark the transaction as rollback-only.
 *
 * <p>Requires Docker for Testcontainers PostgreSQL. Run with:
 * {@code mvn -pl reporting-service test
 * -Dtest=EncargadoRaceConditionTest -Ddocker.available=true}
 *
 * <p>The {@code Test} suffix is deliberate: surefire's default includes are
 * {@code *Test}, {@code Test*}, {@code *Tests} and {@code *TestCase}, so a
 * class named {@code *IT} never runs and there is no failsafe plugin here.
 */
@SpringBootTest(classes = ReportingServiceApp.class)
@EnabledIfSystemProperty(named = "docker.available", matches = "true")
class EncargadoRaceConditionTest {

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
    private EncargadoService service;

    @Autowired
    private EncargadoRepository repository;

    @Autowired
    private DataSource dataSource;

    @Test
    void buscarOCrear_concurrentInsert_bothReturnSameEncargado() throws Exception {
        repository.deleteAll();
        crearIndiceUnicoDeProduccion();

        int threadCount = 2;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        AtomicReference<Optional<EncargadoDto>> result1 = new AtomicReference<>();
        AtomicReference<Optional<EncargadoDto>> result2 = new AtomicReference<>();

        var future1 = executor.submit(() -> {
            startLatch.await();
            return service.buscarOCrear("Juan", "Pérez", "+56 9 1100 0000");
        });
        var future2 = executor.submit(() -> {
            startLatch.await();
            return service.buscarOCrear("Juan", "Pérez", "+56 9 1100 0000");
        });

        startLatch.countDown();

        // Neither call should throw UnexpectedRollbackException.
        assertThatNoException().isThrownBy(future1::get);
        assertThatNoException().isThrownBy(future2::get);

        Optional<EncargadoDto> r1 = future1.get();
        Optional<EncargadoDto> r2 = future2.get();

        // Both should find the same record.
        assertThat(r1).isPresent();
        assertThat(r2).isPresent();
        assertThat(r1.get().id()).isEqualTo(r2.get().id());
        assertThat(r1.get().nombre()).isEqualTo("Juan");
        assertThat(r1.get().apellido()).isEqualTo("Pérez");

        executor.shutdown();
    }

    /**
     * El esquema de este test lo genera Hibernate ({@code create-drop}, Flyway
     * apagado), así que no trae el índice único funcional que sí tiene
     * producción ({@code ux_encargados_natural_identity}, migraciones V1_1/V2).
     * Sin ese índice los dos inserts concurrentes entran los dos y no hay
     * carrera que resolver: el test estaría midiendo un esquema que no existe.
     */
    private void crearIndiceUnicoDeProduccion() throws Exception {
        try (Connection conexion = dataSource.getConnection(); Statement sentencia = conexion.createStatement()) {
            sentencia.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS ux_encargados_natural_identity
                        ON encargados (lower(trim(nombre)), lower(trim(apellido)))
                    """);
        }
    }
}
