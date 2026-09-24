package com.predicador.reporting.exception;

import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.service.EncargadoLoginException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

/**
 * Excepciones propias de reporting. Va antes que el {@code GlobalExceptionHandler}
 * de {@code shared}, cuyo {@code @ExceptionHandler(Exception.class)} las
 * atraparía como 500 genérico.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
@Component("reportingGlobalExceptionHandler")
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(WhatsAppIntegrationException.class)
    public ProblemDetail handleWhatsAppFailure(WhatsAppIntegrationException ex) {
        HttpStatus status = HttpStatus.resolve(ex.status());
        if (status == null || status.is2xxSuccessful()) {
            status = HttpStatus.BAD_GATEWAY;
        }
        log.debug("WhatsAppIntegrationException: status={}, message={}", ex.status(), ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, ex.getMessage());
        problem.setTitle("Fallo en la integración WhatsApp");
        problem.setType(URI.create("https://api.predicador.com/errors/whatsapp-integration"));
        return problem;
    }

    /**
     * Rechazos de login/registro de encargados. {@code code} permite a la app
     * reaccionar (p. ej. mostrar el campo de PIN con {@code pin_requerido}).
     */
    @ExceptionHandler(EncargadoLoginException.class)
    public ProblemDetail handleEncargadoLogin(EncargadoLoginException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        problem.setTitle("No se pudo ingresar");
        problem.setType(URI.create("https://api.predicador.com/errors/encargado-login"));
        problem.setProperty("code", ex.getCode());
        return problem;
    }
}
