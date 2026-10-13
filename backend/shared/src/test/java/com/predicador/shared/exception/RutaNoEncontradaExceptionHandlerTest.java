package com.predicador.shared.exception;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ProblemDetail;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RutaNoEncontradaExceptionHandlerTest {

    private final RutaNoEncontradaExceptionHandler handler = new RutaNoEncontradaExceptionHandler();

    /**
     * Prueba de registro: en una aplicación web servlet (MVC) la condición
     * {@code @ConditionalOnWebApplication(type = SERVLET)} debe evaluarse a
     * verdadero y registrar el advice, de modo que el 404 de ruta inexistente
     * siga resolviéndose igual que antes de sacarlo del advice compartido.
     *
     * <p>La cara reactiva (el gateway WebFlux) no se prueba aquí porque
     * {@code spring-webflux} no está en el classpath de {@code shared}; queda
     * cubierta por {@code ApiGatewayApplicationContextTest} en el gateway.</p>
     */
    @Test
    void registersAsBeanInServletWebApplication() {
        new WebApplicationContextRunner()
                .withUserConfiguration(RutaNoEncontradaExceptionHandler.class)
                .run(context -> {
                    assertNull(context.getStartupFailure(),
                            () -> "context refresh failed: " + context.getStartupFailure());
                    assertTrue(context.containsBean("rutaNoEncontradaExceptionHandler"),
                            "el advice debe registrarse en un contexto web servlet");
                    assertNotNull(context.getBean(RutaNoEncontradaExceptionHandler.class));
                });
    }

    @Test
    void handleNoResourceFound_returns404() {
        // Endpoint borrado en C1 (POST /api/v1/reports/whatsapp/async): la ruta
        // no mapea a ningún handler, Spring lanza NoResourceFoundException y el
        // advice debe responder 404, no 500.
        // En Spring 7 el ctor es (HttpMethod, String location, String resourcePath):
        // el tercer argumento es el que puebla getResourcePath().
        NoResourceFoundException ex = new NoResourceFoundException(
                HttpMethod.POST, "/", "/api/v1/reports/whatsapp/async");
        ProblemDetail problem = handler.handleNoResourceFound(ex);
        assertEquals(404, problem.getStatus());
        assertEquals("Ruta no encontrada", problem.getTitle());
        assertEquals("POST", problem.getProperties().get("method"));
        assertEquals("/api/v1/reports/whatsapp/async", problem.getProperties().get("path"));
    }

    @Test
    void handleNoHandlerFound_returns404() {
        // La otra cara del mismo caso: el TestDispatcherServlet de MockMvc
        // standalone lanza NoHandlerFoundException (la de spring-webmvc, con
        // message "No endpoint {method} {path}.") cuando la ruta no mapea a
        // ningún handler. Mismo contrato 404 que su gemela de Spring Boot.
        NoHandlerFoundException ex = new NoHandlerFoundException(
                "POST", "/api/v1/reports/whatsapp/async", new HttpHeaders());
        ProblemDetail problem = handler.handleNoHandlerFound(ex);
        assertEquals(404, problem.getStatus());
        assertEquals("Ruta no encontrada", problem.getTitle());
        assertEquals("POST", problem.getProperties().get("method"));
        assertEquals("/api/v1/reports/whatsapp/async", problem.getProperties().get("path"));
    }
}
