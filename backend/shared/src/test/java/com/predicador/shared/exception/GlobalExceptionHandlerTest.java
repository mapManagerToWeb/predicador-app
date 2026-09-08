package com.predicador.shared.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleNotFound_returns404ProblemDetail() {
        ResourceNotFoundException ex = new ResourceNotFoundException("Territorio", 42L);
        ProblemDetail problem = handler.handleNotFound(ex);
        assertEquals(404, problem.getStatus());
        assertEquals("Recurso no encontrado", problem.getTitle());
        assertEquals("Territorio", problem.getProperties().get("resource"));
        assertEquals(42L, problem.getProperties().get("id"));
    }

    @Test
    void handleBadRequest_returns400ProblemDetail() {
        IllegalArgumentException ex = new IllegalArgumentException("bad input");
        ProblemDetail problem = handler.handleBadRequest(ex);
        assertEquals(400, problem.getStatus());
        assertEquals("bad input", problem.getDetail());
    }

    @Test
    void handleIllegalState_returns500WithoutLeakingMessage() {
        IllegalStateException ex = new IllegalStateException("secret not configured");
        ProblemDetail problem = handler.handleIllegalState(ex);
        assertEquals(500, problem.getStatus());
        assertEquals("Error interno del servidor", problem.getDetail());
        assertFalse(problem.getDetail().contains("secret"));
    }

    @Test
    void handleNumberFormat_returns400() {
        NumberFormatException ex = new NumberFormatException("For input string: \"abc\"");
        ProblemDetail problem = handler.handleNumberFormat(ex);
        assertEquals(400, problem.getStatus());
    }

    @Test
    void handleGeneral_returns500WithoutLeakingMessage() {
        Exception ex = new RuntimeException("database connection refused");
        ProblemDetail problem = handler.handleGeneral(ex);
        assertEquals(500, problem.getStatus());
        assertEquals("Error interno del servidor", problem.getDetail());
    }
}
