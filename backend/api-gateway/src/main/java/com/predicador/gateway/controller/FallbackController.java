package com.predicador.gateway.controller;

<<<<<<< HEAD
=======
import java.util.HashSet;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
>>>>>>> feat/redesign
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
<<<<<<< HEAD
=======
import org.springframework.web.server.ServerWebExchange;
>>>>>>> feat/redesign
import reactor.core.publisher.Mono;

import static com.predicador.gateway.config.RouteConfig.circuitOpenStatus;

/**
 * Fallback endpoints hit by Resilience4j when a downstream service circuit
 * is open. Return an RFC 7807 {@link ProblemDetail} so the frontend gets a
 * predictable shape regardless of which service failed.
<<<<<<< HEAD
=======
 *
 * <p>Each invocation is logged at WARN with the failure cause so a 503 is
 * diagnosable after the fact. The CB filter stores the causal
 * {@link Throwable} in the exchange attribute
 * {@code CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR} before dispatching here,
 * and this controller is the only place that reads it: the fallback dispatch
 * goes straight to {@code DispatcherHandler}, so route filters (e.g.
 * {@code FallbackHeaders}) never run for the forwarded request.</p>
>>>>>>> feat/redesign
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

<<<<<<< HEAD
    @RequestMapping(value = "/territory", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> territoryFallback() {
        return Mono.just(problem("territory-service", "El servicio de territorios no está disponible."));
=======
    private static final Logger log = LoggerFactory.getLogger(FallbackController.class);

    private static final int MAX_LOGGED_MESSAGE_LENGTH = 200;

    @RequestMapping(value = "/territory", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> territoryFallback(ServerWebExchange exchange) {
        return Mono.just(problem("territory-service", "El servicio de territorios no está disponible.", exchange));
>>>>>>> feat/redesign
    }

    @RequestMapping(value = "/reporting", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
<<<<<<< HEAD
    public Mono<ResponseEntity<ProblemDetail>> reportingFallback() {
        return Mono.just(problem("reporting-service", "El servicio de reportes no está disponible."));
    }

    private ResponseEntity<ProblemDetail> problem(String service, String detail) {
=======
    public Mono<ResponseEntity<ProblemDetail>> reportingFallback(ServerWebExchange exchange) {
        return Mono.just(problem("reporting-service", "El servicio de reportes no está disponible.", exchange));
    }

    ResponseEntity<ProblemDetail> problem(String service, String detail, ServerWebExchange exchange) {
        Throwable cause = exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR);
        log.warn("Circuit breaker fallback ejecutado: service={} causa={} tipo={} detalle={}",
                service, causa(cause), tipoPrincipal(cause), resumir(mensajeRaiz(cause)));
>>>>>>> feat/redesign
        ProblemDetail pd = ProblemDetail.forStatus(circuitOpenStatus());
        pd.setTitle("Servicio no disponible");
        pd.setDetail(detail);
        pd.setProperty("service", service);
        return ResponseEntity.status(circuitOpenStatus()).body(pd);
    }
<<<<<<< HEAD
=======

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
>>>>>>> feat/redesign
}
