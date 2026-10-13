package com.predicador.shared.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;

/**
 * Ruta que no mapea a ningún {@code @RequestMapping}. Sin estos handlers, el
 * {@code @ExceptionHandler(Exception.class)} de {@link GlobalExceptionHandler}
 * convertiría el "no encontrado" de Spring (extensiones desregistradas,
 * endpoints borrados, typos) en un 500. Con ellos, cualquier recurso
 * inexistente responde 404 en vez de parecer un fallo interno.
 *
 * <p>El "no encontrado" llega con dos caras según el entorno: en Spring Boot,
 * la ruta sin handler cae en el resource handler de {@code /**} y lanza
 * {@link NoResourceFoundException}; en {@code MockMvc} standalone, el
 * {@code TestDispatcherServlet} lanza {@link NoHandlerFoundException}. Ambas
 * se mapean igual.</p>
 *
 * <p>Esta clase se separa del advice compartido a propósito. Sus métodos
 * referencian tipos de {@code org.springframework.web.servlet.*}, que existen
 * solo en el classpath de un servicio MVC y <em>no</em> en el gateway WebFlux.
 * Alcance el gateway escanea {@code com.predicador} e intenta introspeccionar
 * todos los {@code @RestControllerAdvice} para construir sus cachés; cualquier
 * método con un tipo servlet en su firma provoca un
 * {@code NoClassDefFoundError} durante la introspección y aborta el arranque
 * del gateway. {@link ConditionalOnWebApplication} con
 * {@code Type.SERVLET} evita ese fallo: en un contexto reactivo la anotación
 * corta el registro (evaluada por metadatos ASM antes de cargar la clase), de
 * modo que la clase nunca se introspecciona.</p>
 *
 * <p>{@code @Order(HIGHEST_PRECEDENCE)} es obligatorio: el
 * {@code @ExceptionHandler(Exception.class)} de {@link GlobalExceptionHandler}
 * también casa con el "no encontrado" y, si este advice quedara después,
 * ganaría el catch-all y la respuesta sería 500. Los resolvers de Spring usan
 * semántica de "primer handler que casa", así que este advice debe ir primero.</p>
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RutaNoEncontradaExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(RutaNoEncontradaExceptionHandler.class);

    @ExceptionHandler(NoResourceFoundException.class)
    public ProblemDetail handleNoResourceFound(NoResourceFoundException ex) {
        return problemaRutaNoEncontrada(ex.getHttpMethod().name(), ex.getResourcePath());
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ProblemDetail handleNoHandlerFound(NoHandlerFoundException ex) {
        return problemaRutaNoEncontrada(ex.getHttpMethod(), ex.getRequestURL());
    }

    private ProblemDetail problemaRutaNoEncontrada(String method, String path) {
        log.debug("Ruta no encontrada: {} {}", method, path);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, "La ruta solicitada no existe");
        problem.setTitle("Ruta no encontrada");
        problem.setType(URI.create("https://api.predicador.com/errors/not-found"));
        problem.setProperty("method", method);
        problem.setProperty("path", path);
        return problem;
    }
}
