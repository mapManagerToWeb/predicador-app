package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.security.SessionToken;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class Task3HardeningTest {

    @Mock ReportRepository reportRepository;
    @Mock EncargadoRepository encargadoRepository;
    @Mock ReportMessageService messageService;
    @Mock com.predicador.reporting.client.WhatsAppMediaClient mediaClient;
    @Mock WhatsAppMessageClient messageClient;
    @Mock WhatsAppProperties properties;
    @Mock com.predicador.reporting.repository.WhatsAppDeliveryRepository deliveryRepository;

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    @Test
    void reportPageUsesTheRequestedBoundedPage() {
        var pageable = PageRequest.of(1, 25);
        when(reportRepository.findAllByOrderByFechaDesc(pageable)).thenReturn(new PageImpl<>(List.of()));

        var service = new ReportService(reportRepository, new SimpleMeterRegistry(), new AuthorizationService());

        assertTrue(service.getAllReports(pageable, admin).isEmpty());
        verify(reportRepository).findAllByOrderByFechaDesc(pageable);
    }

    @Test
    void reportBatchRejectsOversizedInputBeforeRepositoryAccess() {
        var service = new ReportService(reportRepository, new SimpleMeterRegistry(), new AuthorizationService());
        var territories = java.util.stream.LongStream.range(0, 101).boxed().toList();

        assertThrows(IllegalArgumentException.class,
                () -> service.getReportsByMultipleTerritorios(territories, admin));
        verifyNoInteractions(reportRepository);
    }

    @Test
    void buscarOCrearReturnsExistingRecordAfterUniqueCollision() {
        var existing = new com.predicador.reporting.model.Encargado();
        existing.setId(7L);
        existing.setNombre("Daniel");
        existing.setApellido("Uribe");
        existing.setActivo(true);
        when(encargadoRepository.findByNombreIgnoreCaseAndApellidoIgnoreCase("Daniel", "Uribe"))
                .thenReturn(Optional.empty(), Optional.of(existing));
        when(encargadoRepository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate"));

        var service = new EncargadoService(encargadoRepository, new AuthorizationService());

        assertEquals(7L, service.buscarOCrear("Daniel", "Uribe", null).orElseThrow().id());
    }

    @Test
    void repeatedIdempotencyKeyReturnsTheOriginalDeliveryResult() {
        var request = new WhatsAppSendRequest("Daniel", "Uribe", "31-07-2026", "tarde",
                List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 1, 1)), null, null);
        when(messageService.generarParametrosTemplate(request)).thenReturn(java.util.Map.of(
                "fecha", "31-07-2026", "encargado", "Daniel Uribe", "territorio", "1", "estado", "tarde"));
        when(properties.templateName()).thenReturn("template");
        when(properties.languageCode()).thenReturn("es_CL");
        when(properties.destinationNumber()).thenReturn("56912345678");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenReturn(new com.predicador.reporting.client.WhatsAppMessageResponse(null, "message-1"));
        var delivery = new com.predicador.reporting.model.WhatsAppDelivery("delivery-1");
        when(deliveryRepository.findById("delivery-1")).thenReturn(Optional.empty(), Optional.of(delivery));

        var service = new ReportSendService(messageService, mediaClient, messageClient, properties,
                new SimpleMeterRegistry(), deliveryRepository);

        assertNotNull(service.sendReport(request, "delivery-1"));
        assertNotNull(service.sendReport(request, "delivery-1"));
        verify(messageClient, times(1)).sendTemplateMessage(anyString(), anyString(), anyString(), anyList());
    }
}
