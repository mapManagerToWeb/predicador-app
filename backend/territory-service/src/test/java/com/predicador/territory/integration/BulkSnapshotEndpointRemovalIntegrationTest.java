package com.predicador.territory.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Spec f5-gps-mode-cwv-hardening (geojson-api): el snapshot bulk
 * {@code GET /api/v1/territories/all/geojson} fue eliminado y la petición
 * SHALL devolver 404 sin datos de territorios.
 *
 * <p>A diferencia de {@code TerritoryControllerTest} (MockMvc standalone, que
 * nunca produce {@code NoResourceFoundException}), este test usa el contexto
 * completo con el manejador de recursos estáticos en juego: la petición cae de
 * {@code RequestMappingHandlerMapping} a {@code ResourceHttpRequestHandler},
 * que lanza {@code NoResourceFoundException} — el mismo camino real del
 * servidor que el catch-all de {@code GlobalExceptionHandler} convertía en 500
 * (verificado en smoke 7.3).</p>
 *
 * <p>No requiere Docker ni PostGIS: H2 sin Flyway y sin DDL basta porque el
 * test solo ejercita el dispatcher, nunca toca datos.</p>
 */
@SpringBootTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "app.session.secret=test-session-secret-0123456789ABCDEF0123",
        "app.tiles.write-listener-pool-size=2"
})
@AutoConfigureMockMvc
class BulkSnapshotEndpointRemovalIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void removedBulkSnapshot_returns404ProblemDetailWithoutTerritoryData() throws Exception {
        mockMvc.perform(get("/api/v1/territories/all/geojson"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.title").value("Recurso no encontrado"))
                .andExpect(jsonPath("$.type").value("https://api.predicador.com/errors/not-found"))
                .andExpect(content().string(not(containsString("FeatureCollection"))))
                .andExpect(content().string(not(containsString("\"features\""))));
    }
}
