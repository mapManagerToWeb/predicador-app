package com.predicador.gateway.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import static com.predicador.gateway.config.RouteConfig.circuitOpenStatus;

/**
 * Fallback endpoints hit by Resilience4j when a downstream service circuit
 * is open. Return an RFC 7807 {@link ProblemDetail} so the frontend gets a
 * predictable shape regardless of which service failed.
 */
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    @RequestMapping(value = "/territory", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> territoryFallback() {
        return Mono.just(problem("territory-service", "El servicio de territorios no está disponible."));
    }

    @RequestMapping(value = "/reporting", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<ProblemDetail>> reportingFallback() {
        return Mono.just(problem("reporting-service", "El servicio de reportes no está disponible."));
    }

    private ResponseEntity<ProblemDetail> problem(String service, String detail) {
        ProblemDetail pd = ProblemDetail.forStatus(circuitOpenStatus());
        pd.setTitle("Servicio no disponible");
        pd.setDetail(detail);
        pd.setProperty("service", service);
        return ResponseEntity.status(circuitOpenStatus()).body(pd);
    }
}
