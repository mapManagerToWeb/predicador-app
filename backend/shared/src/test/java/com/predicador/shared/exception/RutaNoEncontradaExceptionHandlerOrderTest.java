package com.predicador.shared.exception;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El {@code @Order(Ordered.HIGHEST_PRECEDENCE)} de
 * {@link RutaNoEncontradaExceptionHandler} es carga estructural, no adorno.
 *
 * <p>En producción ambos advices compiten por el mismo "no encontrado":
 * {@link GlobalExceptionHandler} declara {@code @ExceptionHandler(Exception.class)}
 * y {@code NoHandlerFoundException} / {@code NoResourceFoundException} son
 * subtipos de {@code Exception}, así que su catch-all también casa. La resolución
 * de Spring es "primer advice que casa" y el orden lo decide
 * {@link AnnotationAwareOrderComparator} sobre el {@code @Order}: por eso el
 * advice de 404 debe ordenar antes que el catch-all. Sin el {@code @Order}, una
 * ruta inexistente responde 500 en vez de 404 y nada más lo detecta.</p>
 *
 * <p>Este test ancla esa precedencia por dos vías complementarias: (A) extremo a
 * extremo con los dos advices registrados en el mismo {@code MockMvc} —la misma
 * competencia que ocurre en la aplicación real—, y (B) el orden explícito que
 * calcula el comparador. Si se borra el {@code @Order}, ambos fallan.</p>
 *
 * <p>En Spring 7 {@code DispatcherServlet#noHandlerFound} lanza siempre
 * {@code NoHandlerFoundException} y {@code MockMvcBuilders.standaloneSetup}
 * registra los advices en un {@code StubWebApplicationContext}, que
 * {@code ControllerAdviceBean.findAnnotatedBeans} ordena con
 * {@code OrderComparator} —el mismo criterio que un contexto servlet completo—,
 * de modo que este setup refleja fielmente el {@code @Order}.</p>
 */
class RutaNoEncontradaExceptionHandlerOrderTest {

    /** Handler mínimo para que el standalone setup tenga al menos una ruta real. */
    @RestController
    static class PingController {
        @GetMapping("/api/v1/ping")
        String ping() {
            return "pong";
        }
    }

    /**
     * (A) Precedencia de extremo a extremo: con los DOS advices en la misma lista,
     * una ruta sin handler debe responder 404 (lo resuelve
     * {@code RutaNoEncontradaExceptionHandler}) y no 500 (lo que resolvería el
     * catch-all de {@link GlobalExceptionHandler} si ordenara antes).
     *
     * <p>El registro se hace en el orden {@code Global} → {@code Ruta} para que
     * el resultado dependa únicamente del {@code @Order} y no del orden de
     * inserción: con {@code @Order} el advice de 404 sube al frente; sin él,
     * ambos empatan y el sort estable deja al catch-all primero, devolviendo 500.</p>
     */
    @Test
    void rutaInexistente_responde404ConAmbosAdvicesEnCompetencia() throws Exception {
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new PingController())
                .setControllerAdvice(new GlobalExceptionHandler(), new RutaNoEncontradaExceptionHandler())
                .build();

        mockMvc.perform(get("/api/v1/ruta-que-no-existe").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Ruta no encontrada"));
    }

    /**
     * (B) Orden explícito: el comparador que usa Spring debe colocar el advice de
     * 404 antes que el catch-all. Sin {@code @Order(HIGHEST_PRECEDENCE)} ambos
     * quedan en {@code LOWEST_PRECEDENCE} y el primero de la lista es el
     * catch-all, que es justo el fallo que se quiere prevenir.
     */
    @Test
    void rutaNoEncontradaExceptionHandlerPrecedeAlCatchAll() {
        List<Object> advices = new ArrayList<>(List.of(
                new GlobalExceptionHandler(), new RutaNoEncontradaExceptionHandler()));

        AnnotationAwareOrderComparator.sort(advices);

        assertInstanceOf(RutaNoEncontradaExceptionHandler.class, advices.get(0),
                "el advice de 404 debe ordenar antes que el catch-all de 500; "
                        + "si no, una ruta inexistente responde 500 en vez de 404");
    }
}
