package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppMediaClient;
import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.client.WhatsAppMessageResponse;
import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionStatus;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

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
    @Mock private TransactionTemplate txTemplate;

    private ReportSendService sendService;

    @BeforeEach
    void setUp() {
        sendService = new ReportSendService(messageService, mediaClient, messageClient, props,
                new SimpleMeterRegistry(), deliveryRepository, txTemplate);
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
        when(messageService.requiereScreenshot(request)).thenReturn(true);
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
        when(messageService.requiereScreenshot(request)).thenReturn(false);
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
    void sendReport_territorioUnicoCompletado_ignoraScreenshotYUsaImagenPorDefecto() {
        var request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)),
            "base64image", null
        );

        Map<String, String> templateParams = Map.of(
            "fecha", "21-07-2026",
            "encargado", "Daniel Uribe",
            "territorio", "1",
            "estado", "tarde"
        );

        when(messageService.generarParametrosTemplate(request)).thenReturn(templateParams);
        when(messageService.requiereScreenshot(request)).thenReturn(false);
        when(props.apiVersion()).thenReturn("v21.0");
        when(props.phoneNumberId()).thenReturn("123");
        when(props.templateName()).thenReturn("asignacion_territorio");
        when(props.languageCode()).thenReturn("es_CL");
        when(props.destinationNumber()).thenReturn("56936577203");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenReturn(new WhatsAppMessageResponse(null, "msg_default"));

        WhatsAppSendResponse response = sendService.sendReport(request);

        assertTrue(response.success());
        verify(mediaClient, never()).uploadImage(anyString(), anyString());
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
        when(props.destinationNumber()).thenReturn("56999999999");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
            .thenReturn(new WhatsAppMessageResponse(null, "msg_custom"));

        WhatsAppSendResponse response = sendService.sendReport(request);

        assertTrue(response.success());
        verify(messageClient).sendTemplateMessage(eq("56999999999"), anyString(), anyString(), anyList());
    }

    @SuppressWarnings("unchecked")
    @Test
    void reserve_raceCondition_usesSeparateTransactionForRecovery() {
        WhatsAppDelivery existing = com.predicador.reporting.model.WhatsAppDelivery.stale("idempotent-key");

        when(deliveryRepository.findById("idempotent-key"))
            .thenReturn(Optional.empty(), Optional.of(existing));
        when(deliveryRepository.saveAndFlush(any(WhatsAppDelivery.class)))
            .thenThrow(new org.springframework.dao.DataIntegrityViolationException("duplicate"));
        when(txTemplate.execute(any(org.springframework.transaction.support.TransactionCallback.class)))
            .thenAnswer(invocation -> {
                org.springframework.transaction.support.TransactionCallback<?> callback = invocation.getArgument(0);
                return callback.doInTransaction(null);
            });
        when(deliveryRepository.claimStale(eq("idempotent-key"), any(), any(), any())).thenReturn(1);

        sendService.reserve("idempotent-key");

        verify(txTemplate).execute(any(org.springframework.transaction.support.TransactionCallback.class));
        verify(deliveryRepository, times(2)).findById("idempotent-key");
    }
}
