package com.predicador.gateway.controller;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.support.NotFoundException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the fallback cause categorization used in the WARN log.
 * Categories: timeout / circuit-open / connection / unknown. The controller
 * classifies by walking the exception cause chain, so tests exercise both
 * direct and wrapped exceptions.
 */
class FallbackControllerCauseCategoryTest {

    @Test
    void timeoutException_mapsToTimeout() {
        assertThat(FallbackController.causa(new TimeoutException("20s"))).isEqualTo("timeout");
    }

    @Test
    void wrappedTimeoutException_mapsToTimeout() {
        assertThat(FallbackController.causa(new RuntimeException(new TimeoutException()))).isEqualTo("timeout");
    }

    @Test
    void callNotPermitted_mapsToCircuitOpen() {
        // Sin constructor público ni Mockito en este módulo: un stub cuyo nombre
        // contiene "CallNotPermittedException" ejercita la misma clasificación
        // por nombre de clase que captura la excepción real de Resilience4j.
        assertThat(FallbackController.causa(new CallNotPermittedExceptionStub())).isEqualTo("circuit-open");
    }

    @Test
    void connectException_mapsToConnection() {
        assertThat(FallbackController.causa(new ConnectException("Connection refused")))
                .isEqualTo("connection");
    }

    @Test
    void unknownHostException_mapsToConnection() {
        assertThat(FallbackController.causa(new UnknownHostException("reporting-service")))
                .isEqualTo("connection");
    }

    @Test
    void noInstanceFound_mapsToConnection() {
        assertThat(FallbackController.causa(NotFoundException.create(false, "Unable to find instance for reporting-service")))
                .isEqualTo("connection");
    }

    @Test
    void noServersAvailableMessage_mapsToConnection() {
        var illegal = new IllegalStateException("No servers available for service: reporting-service");
        assertThat(FallbackController.causa(illegal)).isEqualTo("connection");
    }

    @Test
    void nullCause_mapsToUnknown() {
        assertThat(FallbackController.causa(null)).isEqualTo("unknown");
    }

    @Test
    void unrelatedException_mapsToUnknown() {
        assertThat(FallbackController.causa(new RuntimeException("boom"))).isEqualTo("unknown");
    }

    private static final class CallNotPermittedExceptionStub extends RuntimeException {
    }
}
