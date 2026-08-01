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

    private static final String RUM_ENDPOINT = "/api/v1/rum";
    private static final String WEB_VITALS = "web.vitals";
    private static final String METRIC_TAG = "metric";
    private static final String ROUTE_TAG = "route";
    private static final String UNKNOWN = "unknown";

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
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":1234.5,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        Timer timer = registry.find(WEB_VITALS)
                .tag(METRIC_TAG, "LCP").tag(ROUTE_TAG, "/map").timer();
        assertNotNull(timer, "LCP timer debería estar registrado");
        assertEquals(1, timer.count());
    }

    @Test
    void ingest_registraSummaryParaCLS() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CLS\",\"value\":0.075,\"route\":\"/profile\"}"))
                .andExpect(status().isNoContent());

        var summary = registry.find("web.vitals.cls").tag(ROUTE_TAG, "/profile").summary();
        assertNotNull(summary);
        assertEquals(1, summary.count());
    }

    @Test
    void ingest_sanitizaCharsPeligrososEnRoute() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"INP\",\"value\":50,\"route\":\"/map?q=<script>\"}"))
                .andExpect(status().isNoContent());

        Timer timer = registry.find(WEB_VITALS).tag(METRIC_TAG, "INP").timer();
        assertNotNull(timer);
        String sanitizedRoute = timer.getId().getTag(ROUTE_TAG);
        assertNotNull(sanitizedRoute);
        assertFalse(sanitizedRoute.contains("<"));
        assertFalse(sanitizedRoute.contains("?"));
    }

    @Test
    void ingest_rechazaNameVacio() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"value\":100,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_rechazaValueNegativo() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":-1,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_ignoraNombresDesconocidosSinFallar() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"FUTURE_METRIC\",\"value\":42,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        assertNull(registry.find(WEB_VITALS).tag(METRIC_TAG, "FUTURE_METRIC").meter());
    }

    @Test
    void ingest_rechazaValueNaN() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":NaN,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingest_rechazaValueInfinity() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":Infinity,\"route\":\"/map\"}"))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.0, 500.0, 1234.5, 60000.0})
    void ingest_aceptaValuesValidos(double value) throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":%s,\"route\":\"/map\"}".formatted(value)))
                .andExpect(status().isNoContent());

        Timer timer = registry.find(WEB_VITALS).tag(METRIC_TAG, "LCP").timer();
        assertNotNull(timer);
    }

    @Test
    void ingest_capValueToMaxLCP() throws Exception {
        mockMvc.perform(post(RUM_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"LCP\",\"value\":999999,\"route\":\"/map\"}"))
                .andExpect(status().isNoContent());

        Timer timer = registry.find(WEB_VITALS).tag(METRIC_TAG, "LCP").timer();
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
        assertEquals(UNKNOWN, result);
    }

    @Test
    void sanitizeRoute_truncaEn40Chars() {
        String longRoute = "/a".repeat(50);
        String result = RumController.sanitizeRoute(longRoute);
        assertTrue(result.length() <= 40);
    }

    @Test
    void sanitizeRoute_routeNullDevuelveUnknown() {
        assertEquals(UNKNOWN, RumController.sanitizeRoute(null));
    }

    @Test
    void sanitizeRoute_routeVaciaDevuelveUnknown() {
        assertEquals(UNKNOWN, RumController.sanitizeRoute(""));
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
