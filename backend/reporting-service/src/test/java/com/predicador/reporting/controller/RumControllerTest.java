package com.predicador.reporting.controller;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RumControllerTest {

    private MockMvc mockMvc;
    private MeterRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        RumController controller = new RumController(registry);
        // standaloneSetup ignora Bean Validation, así que también le habilitamos
        // el validator para poder testear los 400.
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setValidator(new org.springframework.validation.beanvalidation.LocalValidatorFactoryBean())
                .build();
    }

    @Test
    void ingest_registraTimerParaLCP() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":1234.5,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        Timer timer = registry.find("web.vitals")
                .tag("metric", "LCP").tag("route", "/map").timer();
        assertNotNull(timer, "LCP timer debería estar registrado");
        assertEquals(1, timer.count());
    }

    @Test
    void ingest_registraSummaryParaCLS() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CLS\",\"value\":0.075,\"route\":\"/profile\"}"))
                .andExpect(status().isNoContent());

        var summary = registry.find("web.vitals.cls").tag("route", "/profile").summary();
        assertNotNull(summary);
        assertEquals(1, summary.count());
    }

    @Test
    void ingest_sanitizaCharsPeligrososEnRoute() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"INP\",\"value\":50,\"route\":\"/map?q=<script>\"}"))
                .andExpect(status().isNoContent());

        // El char '?' y '<' quedan reemplazados por '_'.
        Timer timer = registry.find("web.vitals").tag("metric", "INP").timer();
        assertNotNull(timer);
        String sanitizedRoute = timer.getId().getTag("route");
        assertNotNull(sanitizedRoute);
        assertFalse(sanitizedRoute.contains("<"));
        assertFalse(sanitizedRoute.contains("?"));
    }

    @Test
    void ingest_rechazaNameVacio() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"value\":100,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_rechazaValueNegativo() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":-1,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_ignoraNombresDesconocidosSinFallar() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"FUTURE_METRIC\",\"value\":42,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        // Debería NO haber creado ningún meter nuevo.
        assertNull(registry.find("web.vitals").tag("metric", "FUTURE_METRIC").meter());
    }
}
