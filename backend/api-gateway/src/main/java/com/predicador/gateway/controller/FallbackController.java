package com.predicador.gateway.controller;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.GZIPOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import static com.predicador.gateway.config.RouteConfig.circuitOpenStatus;

/**
 * Fallback endpoints hit by Resilience4j when a downstream service circuit
 * is open. Return an RFC 7807 {@link ProblemDetail} so the frontend gets a
 * predictable shape regardless of which service failed.
 *
 * <p>Each invocation is logged at WARN with the failure cause so a 503 is
 * diagnosable after the fact. The CB filter stores the causal
 * {@link Throwable} in the exchange attribute
 * {@code CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR} before dispatching here,
 * and this controller is the only place that reads it: the fallback dispatch
 * goes straight to {@code DispatcherHandler}, so route filters (e.g.
 * {@code FallbackHeaders}) never run for the forwarded request.</p>
 *
 * <p>The {@code /tile} endpoint is the exception to the JSON contract: the
 * map requests {@code .pbf} tiles with MapLibre, which treats anything that
 * is not a vector tile as an {@code AJAXError}. The fallback therefore answers
 * a valid empty MVT (gzip of zero bytes, {@code vector-tile} media type) so
 * the tile pipeline stays binary-correct even when the circuit is open.</p>
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    private static final Logger log = LoggerFactory.getLogger(FallbackController.class);

    private static final int MAX_LOGGED_MESSAGE_LENGTH = 200;

    private static final String MVT_MEDIA_TYPE_VALUE = "application/vnd.mapbox-vector-tile";
    private static final MediaType MVT_MEDIA_TYPE = MediaType.parseMediaType(MVT_MEDIA_TYPE_VALUE);

    @RequestMapping(value = "/territory", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> territoryFallback(ServerWebExchange exchange) {
        return Mono.just(problem("territory-service", "El servicio de territorios no está disponible.", exchange));
    }

    @RequestMapping(value = "/reporting", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> reportingFallback(ServerWebExchange exchange) {
        return Mono.just(problem("reporting-service", "El servicio de reportes no está disponible.", exchange));
    }

    @RequestMapping(value = "/tile", method = {RequestMethod.GET},
            produces = MVT_MEDIA_TYPE_VALUE)
    public Mono<ResponseEntity<byte[]>> tileFallback(ServerWebExchange exchange) {
        Throwable cause = exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR);
        log.warn("Circuit breaker fallback ejecutado: service=territory-service-tiles causa={} tipo={} detalle={}",
                causa(cause), tipoPrincipal(cause), resumir(mensajeRaiz(cause)));
        return Mono.just(ResponseEntity.ok()
                .contentType(MVT_MEDIA_TYPE)
                .header(HttpHeaders.CONTENT_ENCODING, "gzip")
                .header(HttpHeaders.VARY, "Accept-Encoding")
                .cacheControl(CacheControl.noStore())
                .body(emptyMvtGzipped()));
    }

    ResponseEntity<ProblemDetail> problem(String service, String detail, ServerWebExchange exchange) {
        Throwable cause = exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR);
        log.warn("Circuit breaker fallback ejecutado: service={} causa={} tipo={} detalle={}",
                service, causa(cause), tipoPrincipal(cause), resumir(mensajeRaiz(cause)));
        ProblemDetail pd = ProblemDetail.forStatus(circuitOpenStatus());
        pd.setTitle("Servicio no disponible");
        pd.setDetail(detail);
        pd.setProperty("service", service);
        return ResponseEntity.status(circuitOpenStatus()).body(pd);
    }

    /**
     * Maps the propagated exception chain to an operator-friendly category:
     * timeout / circuit-open / connection / unknown. Matching is by class name
     * so wrappers added between the failure and this point still classify.
     */
    static String causa(Throwable cause) {
        Set<Throwable> seen = new HashSet<>();
        for (Throwable t = cause; t != null && seen.add(t); t = t.getCause()) {
            String name = t.getClass().getName();
            if (name.contains("TimeoutException")) {
                return "timeout";
            }
            if (name.contains("CallNotPermittedException")) {
                return "circuit-open";
            }
            String message = t.getMessage();
            if (name.contains("ConnectException")
                    || name.contains("UnknownHostException")
                    || name.contains("NotFoundException")
                    || (message != null && (message.contains("Unable to find instance")
                        || message.contains("No servers available")))) {
                return "connection";
            }
        }
        return "unknown";
    }

    static String tipoPrincipal(Throwable cause) {
        return cause == null ? "" : cause.getClass().getSimpleName();
    }

    static String mensajeRaiz(Throwable cause) {
        if (cause == null) {
            return "";
        }
        Set<Throwable> seen = new HashSet<>();
        Throwable root = cause;
        for (Throwable t = cause; t != null && seen.add(t); t = t.getCause()) {
            root = t;
        }
        return root.getMessage() == null ? "" : root.getMessage();
    }

    static String resumir(String message) {
        String clean = message == null ? "" : message.replaceAll("[\\r\\n\\t]", " ").trim();
        return clean.length() <= MAX_LOGGED_MESSAGE_LENGTH ? clean
                : clean.substring(0, MAX_LOGGED_MESSAGE_LENGTH) + "…";
    }

    /**
     * Gzip de un tile MVT vacío: {@code VectorTile.Tile} con cero features
     * serializa a cero bytes, así que el fallback devuelve un gzip válido de
     * un array vacío (cabecera + CRC) que MapLibre puede descomprimir sin
     * disparar un AJAXError. Sin dependencia protobuf: el tile vacío es
     * literalmente vacío.
     */
    private static byte[] emptyMvtGzipped() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            // Sin escritura: el MVT vacío son cero bytes.
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo comprimir el tile MVT vacío", e);
        }
        return out.toByteArray();
    }
}
