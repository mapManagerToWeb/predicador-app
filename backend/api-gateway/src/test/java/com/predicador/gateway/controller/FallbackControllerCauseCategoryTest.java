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

    // --- tipoPrincipal ---

    @Test
    void tipoPrincipal_nullCause_returnsEmpty() {
        assertThat(FallbackController.tipoPrincipal(null)).isEmpty();
    }

    @Test
    void tipoPrincipal_returnsSimpleClassName() {
        assertThat(FallbackController.tipoPrincipal(new TimeoutException("x")))
                .isEqualTo("TimeoutException");
    }

    // --- mensajeRaiz ---

    @Test
    void mensajeRaiz_nullCause_returnsEmpty() {
        assertThat(FallbackController.mensajeRaiz(null)).isEmpty();
    }

    @Test
    void mensajeRaiz_returnsRootMessage() {
        var root = new RuntimeException("root cause");
        var wrapper = new RuntimeException("wrapper", root);
        assertThat(FallbackController.mensajeRaiz(wrapper)).isEqualTo("root cause");
    }

    @Test
    void mensajeRaiz_nullMessage_returnsEmpty() {
        assertThat(FallbackController.mensajeRaiz(new RuntimeException())).isEmpty();
    }

    // --- resumir ---

    @Test
    void resumir_nullMessage_returnsEmpty() {
        assertThat(FallbackController.resumir(null)).isEmpty();
    }

    @Test
    void resumir_shortMessage_returnedAsIs() {
        assertThat(FallbackController.resumir("hello")).isEqualTo("hello");
    }

    @Test
    void resumir_longMessage_truncatedTo200Chars() {
        String longMsg = "x".repeat(300);
        String result = FallbackController.resumir(longMsg);
        assertThat(result).hasSize(201); // 200 chars + ellipsis
        assertThat(result).endsWith("…");
    }

    @Test
    void resumir_replacesWhitespaceAndTrims() {
        assertThat(FallbackController.resumir("  line1\nline2\tline3  "))
                .isEqualTo("line1 line2 line3");
    }

    private static final class CallNotPermittedExceptionStub extends RuntimeException {
    }
}
