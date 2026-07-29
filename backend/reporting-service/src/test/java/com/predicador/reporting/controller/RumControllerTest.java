package com.predicador.reporting.controller;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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

        assertNull(registry.find("web.vitals").tag("metric", "FUTURE_METRIC").meter());
    }

    @Test
    void ingest_rechazaValueNaN() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":NaN,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_rechazaValueInfinity() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":Infinity,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.0, 500.0, 1234.5, 60000.0})
    void ingest_aceptaValuesValidos(double value) throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":%s,\"route\":\"/map\"}".formatted(value)))
                .andExpect(status().isNoContent());

        Timer timer = registry.find("web.vitals").tag("metric", "LCP").timer();
        assertNotNull(timer);
    }

    @Test
    void ingest_capValueToMaxLCP() throws Exception {
        mockMvc.perform(post("/api/v1/rum")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":999999,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        Timer timer = registry.find("web.vitals").tag("metric", "LCP").timer();
        assertNotNull(timer);
        // Timer should have recorded the capped value (60000ms)
        assertTrue(timer.totalTime(java.util.concurrent.TimeUnit.MILLISECONDS) <= 60001);
    }

    @Test
    void sanitizeRoute_colapsaSegmentosDinamicos() {
        String result = RumController.sanitizeRoute("/territories/123/color");
        assertEquals("/territories/:id/color", result);
    }

    @Test
    void sanitizeRoute_rechazaRutaDesconocida() {
        String result = RumController.sanitizeRoute("/unknown/path");
        assertEquals("unknown", result);
    }

    @Test
    void sanitizeRoute_truncaEn40Chars() {
        String longRoute = "/a".repeat(50);
        String result = RumController.sanitizeRoute(longRoute);
        assertTrue(result.length() <= 40);
    }

    @Test
    void sanitizeRoute_routeNullDevuelveUnknown() {
        assertEquals("unknown", RumController.sanitizeRoute(null));
    }

    @Test
    void sanitizeRoute_routeVaciaDevuelveUnknown() {
        assertEquals("unknown", RumController.sanitizeRoute(""));
    }

    @Test
    void capMetricValue_noExcedeMaxCLS() {
        double result = RumController.capMetricValue("CLS", 10.0);
        assertEquals(5.0, result);
    }

    @Test
    void capMetricValue_noExcedeMaxINP() {
        double result = RumController.capMetricValue("INP", 50000.0);
        assertEquals(10_000.0, result);
    }

    @Test
    void capMetricValue_noExcedeMaxFCP() {
        double result = RumController.capMetricValue("FCP", 50000.0);
        assertEquals(30_000.0, result);
    }

    @Test
    void capMetricValue_noExcedeMaxTTFB() {
        double result = RumController.capMetricValue("TTFB", 50000.0);
        assertEquals(30_000.0, result);
    }

    @Test
    void allowedMetrics_contieneLas5Esperadas() {
        assertEquals(5, RumController.ALLOWED_METRICS.size());
        assertTrue(RumController.ALLOWED_METRICS.contains("LCP"));
        assertTrue(RumController.ALLOWED_METRICS.contains("INP"));
        assertTrue(RumController.ALLOWED_METRICS.contains("CLS"));
        assertTrue(RumController.ALLOWED_METRICS.contains("FCP"));
        assertTrue(RumController.ALLOWED_METRICS.contains("TTFB"));
    }
}
