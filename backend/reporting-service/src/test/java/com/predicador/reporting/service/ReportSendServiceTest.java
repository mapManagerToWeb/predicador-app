package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppMediaClient;
import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.client.WhatsAppMessageResponse;
import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReportSendServiceTest {

    @Mock private ReportMessageService messageService;
    @Mock private WhatsAppMediaClient mediaClient;
    @Mock private WhatsAppMessageClient messageClient;
    @Mock private WhatsAppProperties props;
    @Mock private WhatsAppDeliveryRepository deliveryRepository;

    private ReportSendService sendService;

    @BeforeEach
    void setUp() {
        sendService = new ReportSendService(messageService, mediaClient, messageClient, props,
                new SimpleMeterRegistry(), deliveryRepository);
    }

    @Test
    void sendReport_conScreenshot_territorioIncompleto() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(
                new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12),
                new WhatsAppSendRequest.TerritorioReporte(2L, false, 8, 5)
            ),
            "base64image", null
        );

        Map<String, String> templateParams = Map.of(
            "fecha", "21-07-2026",
            "encargado", "Daniel Uribe",
            "territorio", "1, 2",
            "estado", "tarde"
        );

        when(messageService.generarParametrosTemplate(request)).thenReturn(templateParams);
        when(mediaClient.uploadImage("base64image", "image/jpeg")).thenReturn("media_123");
        when(props.apiVersion()).thenReturn("v21.0");
        when(props.phoneNumberId()).thenReturn("123");
        when(props.templateName()).thenReturn("asignacion_territorio");
        when(props.languageCode()).thenReturn("es_CL");
        when(props.destinationNumber()).thenReturn("56936577203");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenReturn(new WhatsAppMessageResponse(null, "msg_456"));

        WhatsAppSendResponse response = sendService.sendReport(request);

        assertTrue(response.success());
        assertEquals("msg_456", response.messageId());
        verify(mediaClient).uploadImage("base64image", "image/jpeg");
    }

    @Test
    void sendReport_sinScreenshot_imagenPorDefecto_territorioCompletado() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            null, null
        );

        Map<String, String> templateParams = Map.of(
            "fecha", "21-07-2026",
            "encargado", "Daniel Uribe",
            "territorio", "1",
            "estado", "tarde"
        );

        when(messageService.generarParametrosTemplate(request)).thenReturn(templateParams);
        when(props.apiVersion()).thenReturn("v21.0");
        when(props.phoneNumberId()).thenReturn("123");
        when(props.templateName()).thenReturn("asignacion_territorio");
        when(props.languageCode()).thenReturn("es_CL");
        when(props.destinationNumber()).thenReturn("56936577203");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenReturn(new WhatsAppMessageResponse(null, "msg_default"));

        WhatsAppSendResponse response = sendService.sendReport(request);

        assertTrue(response.success());
        assertEquals("msg_default", response.messageId());
        verify(mediaClient, never()).uploadImage(anyString(), anyString());
    }

    @Test
    void sendReport_errorEnMeta() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "mañana",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            "base64image", null
        );

        Map<String, String> templateParams = Map.of(
            "fecha", "21-07-2026",
            "encargado", "Daniel Uribe",
            "territorio", "1",
            "estado", "mañana"
        );

        when(messageService.generarParametrosTemplate(request)).thenReturn(templateParams);
        when(mediaClient.uploadImage("base64image", "image/jpeg")).thenReturn("media_123");
        when(props.apiVersion()).thenReturn("v21.0");
        when(props.phoneNumberId()).thenReturn("123");
        when(props.templateName()).thenReturn("asignacion_territorio");
        when(props.languageCode()).thenReturn("es_CL");
        when(props.destinationNumber()).thenReturn("56936577203");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenThrow(new RuntimeException("Meta API error"));

        assertThrows(RuntimeException.class, () -> sendService.sendReport(request));
    }

    @Test
    void sendReport_numeroDestinoCustom() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            "base64image", "56999999999"
        );

        Map<String, String> templateParams = Map.of(
            "fecha", "21-07-2026",
            "encargado", "Daniel Uribe",
            "territorio", "1",
            "estado", "tarde"
        );

        when(messageService.generarParametrosTemplate(request)).thenReturn(templateParams);
        when(mediaClient.uploadImage("base64image", "image/jpeg")).thenReturn("media_123");
        when(props.apiVersion()).thenReturn("v21.0");
        when(props.phoneNumberId()).thenReturn("123");
        when(props.templateName()).thenReturn("asignacion_territorio");
        when(props.languageCode()).thenReturn("es_CL");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenReturn(new WhatsAppMessageResponse(null, "msg_custom"));

        WhatsAppSendResponse response = sendService.sendReport(request);

        assertTrue(response.success());
        verify(messageClient).sendTemplateMessage(eq("56999999999"), anyString(), anyString(), anyList());
    }
}
