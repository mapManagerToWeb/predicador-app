package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.client.WhatsAppMessageResponse;
import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WhatsAppSendServiceTest {

    @Mock private ReportSendService sendService;
    @Mock private WhatsAppMessageClient messageClient;
    @Mock private WhatsAppDeliveryRepository deliveryRepository;
    @Mock private TransactionTemplate txTemplate;
    @Mock private Executor executor;

    private WhatsAppSendService whatsAppSendService;

    private final WhatsAppSendRequest request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)), null, null);

    @BeforeEach
    void setUp() {
        whatsAppSendService = new WhatsAppSendService(sendService, messageClient, deliveryRepository, txTemplate, executor);
    }

    @Test
    void submit_newKey_schedulesTaskAndReturnsInProgress() {
        when(deliveryRepository.findById("key-new")).thenReturn(Optional.empty());

        WhatsAppDeliveryDto dto = whatsAppSendService.submit(request, "key-new");

        assertEquals("IN_PROGRESS", dto.status());
        assertEquals("key-new", dto.idempotencyKey());
        verify(executor).execute(any(Runnable.class));
    }

    @Test
    void submit_existingCompleted_returnsResultWithoutScheduling() {
        WhatsAppDelivery completed = new WhatsAppDelivery("key-done");
        completed.markSucceeded("msg_123");
        when(deliveryRepository.findById("key-done")).thenReturn(Optional.of(completed));

        WhatsAppDeliveryDto dto = whatsAppSendService.submit(request, "key-done");

        assertEquals("SUCCEEDED", dto.status());
        assertEquals("msg_123", dto.messageId());
        verify(executor, never()).execute(any(Runnable.class));
    }

    @Test
    void submit_withoutKey_throwsBadRequest() {
        var exception = assertThrows(WhatsAppIntegrationException.class,
                () -> whatsAppSendService.submit(request, null));
        assertEquals(400, exception.status());
        verify(executor, never()).execute(any(Runnable.class));
    }

    @Test
    void getStatus_missingKey_returnsInProgress() {
        when(deliveryRepository.findById("key-unknown")).thenReturn(Optional.empty());

        WhatsAppDeliveryDto dto = whatsAppSendService.getStatus("key-unknown");

        assertEquals("IN_PROGRESS", dto.status());
    }

    @Test
    void getStatus_failedDelivery_exposesError() {
        WhatsAppDelivery failed = new WhatsAppDelivery("key-failed");
        failed.markFailed("Meta rejected", 422);
        when(deliveryRepository.findById("key-failed")).thenReturn(Optional.of(failed));

        WhatsAppDeliveryDto dto = whatsAppSendService.getStatus("key-failed");

        assertEquals("FAILED", dto.status());
        assertEquals("Meta rejected", dto.error());
        assertEquals(WhatsAppDeliveryStatus.FAILED.name(), dto.status());
    }

    @Test
    void process_swallowsIntegrationFailurePersistedByWorker() {
        doThrow(new WhatsAppIntegrationException("Meta rejected", 422, null))
                .when(sendService).sendReport(any(), anyString());

        assertDoesNotThrow(() -> whatsAppSendService.process(request, "key-failed"));
    }

    @Test
    void process_swallowsUnexpectedRuntimeException() {
        doThrow(new IllegalStateException("boom"))
                .when(sendService).sendReport(any(), anyString());

        assertDoesNotThrow(() -> whatsAppSendService.process(request, "key-error"));
    }

    @Test
    void sendTemplateMessage_newKey_sendsAndPersistsSuccess() {
        when(deliveryRepository.findById("key-new")).thenReturn(Optional.empty());
        when(deliveryRepository.saveAndFlush(any(WhatsAppDelivery.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenReturn(new WhatsAppMessageResponse(null, "msg_789"));

        assertDoesNotThrow(() -> whatsAppSendService.sendTemplateMessage(
                "key-new", "56987654321", "template_name", "es_CL",
                List.of(Map.of("type", "body", "parameters", List.of()))));

        verify(messageClient).sendTemplateMessage(
                eq("56987654321"), eq("template_name"), eq("es_CL"), anyList());
        verify(deliveryRepository).save(argThat(d ->
                d.getIdempotencyKey().equals("key-new") &&
                d.getStatus() == WhatsAppDeliveryStatus.SUCCEEDED &&
                d.getMessageId().equals("msg_789")));
    }

    @Test
    void sendTemplateMessage_existingCompleted_doesNotResend() {
        WhatsAppDelivery completed = new WhatsAppDelivery("key-done");
        completed.markSucceeded("msg_999");
        when(deliveryRepository.findById("key-done")).thenReturn(Optional.of(completed));

        assertDoesNotThrow(() -> whatsAppSendService.sendTemplateMessage(
                "key-done", "56987654321", "template_name", "es_CL",
                List.of(Map.of("type", "body", "parameters", List.of()))));

        verify(messageClient, never()).sendTemplateMessage(anyString(), anyString(), anyString(), anyList());
        verify(deliveryRepository, never()).saveAndFlush(any());
    }

    @Test
    void sendTemplateMessage_withoutKey_throwsBadRequest() {
        var exception = assertThrows(WhatsAppIntegrationException.class,
                () -> whatsAppSendService.sendTemplateMessage(
                        null, "56987654321", "template_name", "es_CL",
                        List.of(Map.of("type", "body", "parameters", List.of()))));
        assertEquals(400, exception.status());
        verify(messageClient, never()).sendTemplateMessage(anyString(), anyString(), anyString(), anyList());
    }

    @Test
    void sendTemplateMessage_whatsappFailure_persistsFailureAndThrows() {
        when(deliveryRepository.findById("key-fail")).thenReturn(Optional.empty());
        when(deliveryRepository.saveAndFlush(any(WhatsAppDelivery.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenThrow(new WhatsAppIntegrationException("Meta rejected", 422, null));

        var exception = assertThrows(WhatsAppIntegrationException.class,
                () -> whatsAppSendService.sendTemplateMessage(
                        "key-fail", "56987654321", "template_name", "es_CL",
                        List.of(Map.of("type", "body", "parameters", List.of()))));
        assertEquals(422, exception.status());

        verify(deliveryRepository).save(argThat(d ->
                d.getIdempotencyKey().equals("key-fail") &&
                d.getStatus() == WhatsAppDeliveryStatus.FAILED &&
                d.getError().equals("Meta rejected") &&
                d.getStatusCode() == 422));
    }

    @Test
    void sendTemplateMessage_unexpectedError_persistsFailureAndWraps() {
        when(deliveryRepository.findById("key-error")).thenReturn(Optional.empty());
        when(deliveryRepository.saveAndFlush(any(WhatsAppDelivery.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenThrow(new IllegalStateException("boom"));

        var exception = assertThrows(WhatsAppIntegrationException.class,
                () -> whatsAppSendService.sendTemplateMessage(
                        "key-error", "56987654321", "template_name", "es_CL",
                        List.of(Map.of("type", "body", "parameters", List.of()))));
        assertEquals(502, exception.status());

        verify(deliveryRepository).save(argThat(d ->
                d.getIdempotencyKey().equals("key-error") &&
                d.getStatus() == WhatsAppDeliveryStatus.FAILED &&
                d.getStatusCode() == 502));
    }

    @Test
    void sendTemplateMessage_leaseActive_throwsConflict() {
        WhatsAppDelivery inProgress = new WhatsAppDelivery("key-lease");
        inProgress.renewLease(java.time.Instant.now().plus(java.time.Duration.ofMinutes(10)));
        when(deliveryRepository.findById("key-lease")).thenReturn(Optional.of(inProgress));

        var exception = assertThrows(WhatsAppIntegrationException.class,
                () -> whatsAppSendService.sendTemplateMessage(
                        "key-lease", "56987654321", "template_name", "es_CL",
                        List.of(Map.of("type", "body", "parameters", List.of()))));
        assertEquals(409, exception.status());
        verify(messageClient, never()).sendTemplateMessage(anyString(), anyString(), anyString(), anyList());
    }

    @Test
    void sendTemplateMessage_staleDelivery_claimsAndSends() {
        WhatsAppDelivery stale = WhatsAppDelivery.stale("key-stale");
        when(deliveryRepository.findById("key-stale"))
                .thenReturn(Optional.of(stale), Optional.of(stale));
        when(deliveryRepository.claimStale(anyString(), any(), any(), any())).thenReturn(1);
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenReturn(new WhatsAppMessageResponse(null, "msg_stale"));

        assertDoesNotThrow(() -> whatsAppSendService.sendTemplateMessage(
                "key-stale", "56987654321", "template_name", "es_CL",
                List.of(Map.of("type", "body", "parameters", List.of()))));

        verify(deliveryRepository).claimStale(
                eq("key-stale"), eq(WhatsAppDeliveryStatus.IN_PROGRESS), any(), any());
        verify(messageClient).sendTemplateMessage(
                eq("56987654321"), eq("template_name"), eq("es_CL"), anyList());
    }
}
