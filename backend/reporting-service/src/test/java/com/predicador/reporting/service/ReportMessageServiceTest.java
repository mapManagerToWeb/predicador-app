package com.predicador.reporting.service;

import com.predicador.reporting.dto.WhatsAppSendRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ReportMessageServiceTest {

    private final ReportMessageService service = new ReportMessageService();

    @Test
    void generarParametrosTemplate_predicacionTarde() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            null, null
        );

        Map<String, String> params = service.generarParametrosTemplate(request);

        assertEquals("21-07-2026", params.get("fecha"));
        assertEquals("Daniel Uribe", params.get("encargado"));
        assertEquals("Territorio 1 *terminado*", params.get("territorio"));
        assertEquals("tarde", params.get("estado"));
    }

    @Test
    void generarParametrosTemplate_predicacionManana() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "mañana",
            List.of(new WhatsAppSendRequest.TerritorioReporte(3L, false, 8, 5)),
            null, null
        );

        Map<String, String> params = service.generarParametrosTemplate(request);

        assertEquals("Territorio 3 *faltante*", params.get("territorio"));
        assertEquals("mañana", params.get("estado"));
    }

    @Test
    void generarParametrosTemplate_predicacionNull_fallback() {
        var request = new WhatsAppSendRequest(
            "Maria", "Lopez", "21-07-2026", null,
            List.of(
                new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12),
                new WhatsAppSendRequest.TerritorioReporte(2L, false, 8, 5)
            ),
            null, null
        );

        Map<String, String> params = service.generarParametrosTemplate(request);

        assertEquals("Territorio 1 *terminado* | Territorio 2 *faltante*", params.get("territorio"));
        assertEquals("tarde", params.get("estado"));
    }

    @Test
    void generarParametrosTemplate_todosFinalizados() {
        var request = new WhatsAppSendRequest(
            "Bastian", "Sandoval", "21-07-2026", "mañana",
            List.of(
                new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12),
                new WhatsAppSendRequest.TerritorioReporte(2L, true, 8, 8)
            ),
            null, null
        );

        Map<String, String> params = service.generarParametrosTemplate(request);

        assertEquals("Territorio 1 *terminado* | Territorio 2 *terminado*", params.get("territorio"));
        assertEquals("mañana", params.get("estado"));
    }

    @Test
    void requiereScreenshot_variosTerritorios() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(
                new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12),
                new WhatsAppSendRequest.TerritorioReporte(2L, true, 8, 8)
            ),
            null, null
        );

        assertTrue(service.requiereScreenshot(request));
    }

    @Test
    void requiereScreenshot_unTerritorioIncompleto() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, false, 12, 5)),
            null, null
        );

        assertTrue(service.requiereScreenshot(request));
    }

    @Test
    void noRequiereScreenshot_unTerritorioFinalizado() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            null, null
        );

        assertFalse(service.requiereScreenshot(request));
    }
}
