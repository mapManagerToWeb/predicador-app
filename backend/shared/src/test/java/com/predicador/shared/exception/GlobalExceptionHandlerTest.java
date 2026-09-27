package com.predicador.shared.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ProblemDetail;
import org.springframework.web.servlet.resource.NoResourceFoundException;

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
    void handleNoResourceFound_returns404ProblemDetailWithoutData() {
        // Spec geojson-api: /api/v1/territories/all/geojson fue eliminada; el
        // dispatcher real cae a recursos estáticos y ResourceHttpRequestHandler
        // lanza NoResourceFoundException → debe ser 404, nunca 500 del catch-all,
        // y sin payload de territorios.
        NoResourceFoundException ex = new NoResourceFoundException(
                HttpMethod.GET, "/api/v1/territories/all/geojson",
                "No static resource api/v1/territories/all/geojson.");
        ProblemDetail problem = handler.handleNoResourceFound(ex);
        assertEquals(404, problem.getStatus());
        assertEquals("Recurso no encontrado", problem.getTitle());
        assertEquals("Recurso no encontrado", problem.getDetail());
        assertEquals("https://api.predicador.com/errors/not-found", problem.getType().toString());
        assertTrue(problem.getProperties() == null || problem.getProperties().isEmpty());
        assertFalse(problem.getDetail().contains("FeatureCollection"));
        assertFalse(problem.getDetail().contains("features"));
    }

    @Test
    void handleGeneral_returns500WithoutLeakingMessage() {
        Exception ex = new RuntimeException("database connection refused");
        ProblemDetail problem = handler.handleGeneral(ex);
        assertEquals(500, problem.getStatus());
        assertEquals("Error interno del servidor", problem.getDetail());
    }
}
