package com.predicador.gateway.controller;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.concurrent.TimeoutException;
import java.util.zip.GZIPInputStream;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the binary tile fallback contract. Unlike the JSON fallbacks, the
 * {@code /fallback/tile} endpoint must answer a valid empty gzip MVT
 * ({@code application/vnd.mapbox-vector-tile}, no charset) instead of a
 * ProblemDetail: MapLibre parses every {@code .pbf} response as a vector
 * tile, and a JSON 503 surfaces as an {@code AJAXError} that blanks the map
 * during a Neon cold start.
 */
class FallbackControllerTileTest {

    private final FallbackController controller = new FallbackController();

    @Test
    void tileFallback_returnsOkWithGzippedEmptyMvt() throws IOException {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/fallback/tile"));

        var response = controller.tileFallback(exchange).block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .as("MVT media type, no charset")
                .hasToString("application/vnd.mapbox-vector-tile");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_ENCODING)).isEqualTo("gzip");
        assertThat(response.getHeaders().getFirst(HttpHeaders.VARY)).isEqualTo("Accept-Encoding");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).contains("no-store");

        byte[] body = response.getBody();
        assertThat(body).as("fallback must carry a body").isNotNull();

        byte[] gunzipped;
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(body))) {
            gunzipped = gzip.readAllBytes();
        }
        assertThat(gunzipped)
                .as("an empty VectorTile.Tile serializes to zero bytes")
                .isEmpty();
    }

    @Test
    void tileFallback_withCircuitBreakerCause_stillReturnsEmptyMvt() throws IOException {
        var request = MockServerHttpRequest.get("/fallback/tile").build();
        var exchange = MockServerWebExchange.from(request);
        exchange.getAttributes().put(
                ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR,
                new TimeoutException("tile cold start"));

        var response = controller.tileFallback(exchange).block();

        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).hasToString("application/vnd.mapbox-vector-tile");

        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(response.getBody()))) {
            assertThat(gzip.readAllBytes()).isEmpty();
        }
    }
}