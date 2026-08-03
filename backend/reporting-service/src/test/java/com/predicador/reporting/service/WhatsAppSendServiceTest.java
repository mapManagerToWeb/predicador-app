package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppIntegrationException;
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

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WhatsAppSendServiceTest {

    @Mock private ReportSendService sendService;
    @Mock private WhatsAppDeliveryRepository deliveryRepository;
    @Mock private Executor executor;

    private WhatsAppSendService whatsAppSendService;

    private final WhatsAppSendRequest request = new WhatsAppSendRequest(
            "Daniel", "Uribe", "21-07-2026", "tarde",
            List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 12, 12)), null, null);

    @BeforeEach
    void setUp() {
        whatsAppSendService = new WhatsAppSendService(sendService, deliveryRepository, executor);
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
}
