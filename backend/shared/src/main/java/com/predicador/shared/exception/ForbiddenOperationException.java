package com.predicador.shared.exception;

/**
 * Excepción de dominio que señala que la operación fue rechazada
 * por una regla de negocio o autorización, no por un error técnico.
 *
 * <p>El {@link GlobalExceptionHandler} la mapea a {@code 403 Forbidden}
 * con un ProblemDetail RFC 9457.</p>
 */
public class ForbiddenOperationException extends RuntimeException {

    public ForbiddenOperationException(String message) {
        super(message);
    }

    public ForbiddenOperationException(String message, Throwable cause) {
        super(message, cause);
    }
}
