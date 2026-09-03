package com.predicador.reporting.exception;

import com.predicador.reporting.client.WhatsAppIntegrationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@RestControllerAdvice
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
}
