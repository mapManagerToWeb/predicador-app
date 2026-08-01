package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.shared.security.SessionToken;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import io.micrometer.core.instrument.MeterRegistry;

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
    @Mock TransactionTemplate txTemplate;

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
        when(encargadoRepository.findByNaturalIdentity("Daniel", "Uribe"))
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
        when(deliveryRepository.saveAndFlush(any())).thenReturn(delivery);

        var service = new ReportSendService(messageService, mediaClient, messageClient, properties,
                new SimpleMeterRegistry(), deliveryRepository, txTemplate);

        assertNotNull(service.sendReport(request, "delivery-1"));
        assertNotNull(service.sendReport(request, "delivery-1"));
        verify(messageClient, times(1)).sendTemplateMessage(anyString(), anyString(), anyString(), anyList());
    }

    @Test
    void reportSendServiceHasOneConstructorAndSpringWiresDeliveryRepository() {
        assertEquals(1, ReportSendService.class.getDeclaredConstructors().length);
        try (var context = new AnnotationConfigApplicationContext(BeanConfig.class)) {
            assertNotNull(context.getBean(ReportSendService.class));
        }
    }

    @Test
    void staleReservationCanBeReclaimed() {
        var request = new WhatsAppSendRequest("Daniel", "Uribe", "31-07-2026", "tarde",
                List.of(new WhatsAppSendRequest.TerritorioReporte(1L, true, 1, 1)), null, null);
        var stale = WhatsAppDelivery.stale("delivery-stale");
        when(deliveryRepository.findById("delivery-stale")).thenReturn(Optional.of(stale));
        when(deliveryRepository.claimStale(eq("delivery-stale"), any(), any(), any())).thenReturn(1);
        when(messageService.generarParametrosTemplate(request)).thenReturn(java.util.Map.of(
                "fecha", "31-07-2026", "encargado", "Daniel Uribe", "territorio", "1", "estado", "tarde"));
        when(properties.templateName()).thenReturn("template");
        when(properties.languageCode()).thenReturn("es_CL");
        when(properties.destinationNumber()).thenReturn("56912345678");
        when(messageClient.sendTemplateMessage(anyString(), anyString(), anyString(), anyList()))
                .thenReturn(new com.predicador.reporting.client.WhatsAppMessageResponse(null, "message-1"));

        var service = new ReportSendService(messageService, mediaClient, messageClient, properties,
                new SimpleMeterRegistry(), deliveryRepository, txTemplate);

        assertTrue(service.sendReport(request, "delivery-stale").success());
    }

    @Test
    void replayedFailedDeliveryRaisesIntegrationFailure() {
        var failed = WhatsAppDelivery.failed("delivery-failed", "Meta rejected", 422);
        when(deliveryRepository.findById("delivery-failed")).thenReturn(Optional.of(failed));
        var service = new ReportSendService(messageService, mediaClient, messageClient, properties,
                new SimpleMeterRegistry(), deliveryRepository, txTemplate);

        var exception = assertThrows(com.predicador.reporting.client.WhatsAppIntegrationException.class,
                () -> service.sendReport(null, "delivery-failed"));
        assertEquals(422, exception.status());
        verifyNoInteractions(messageClient);
    }

    @Test
    void persistentReservationDatabaseFailureBecomesControlledIntegrationFailure() {
        when(deliveryRepository.findById("delivery-db-error")).thenReturn(Optional.empty());
        when(deliveryRepository.saveAndFlush(any()))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("database unavailable"));
        when(txTemplate.execute(any())).thenReturn(Optional.empty());
        var service = new ReportSendService(messageService, mediaClient, messageClient, properties,
                new SimpleMeterRegistry(), deliveryRepository, txTemplate);

        var exception = assertThrows(com.predicador.reporting.client.WhatsAppIntegrationException.class,
                () -> service.sendReport(null, "delivery-db-error"));
        assertEquals(503, exception.status());
        verify(deliveryRepository, times(1)).saveAndFlush(any());
    }

    @Test
    void staleClaimRepositoryMethodIsTransactional() throws Exception {
        var method = com.predicador.reporting.repository.WhatsAppDeliveryRepository.class
                .getMethod("claimStale", String.class,
                        com.predicador.reporting.model.WhatsAppDeliveryStatus.class,
                        java.time.Instant.class, java.time.Instant.class);
        assertNotNull(method.getAnnotation(Transactional.class));
    }

    @Configuration
    static class BeanConfig {
        @Bean ReportMessageService messageService() { return mock(ReportMessageService.class); }
        @Bean com.predicador.reporting.client.WhatsAppMediaClient mediaClient() { return mock(com.predicador.reporting.client.WhatsAppMediaClient.class); }
        @Bean WhatsAppMessageClient messageClient() { return mock(WhatsAppMessageClient.class); }
        @Bean WhatsAppProperties properties() { return mock(WhatsAppProperties.class); }
        @Bean MeterRegistry registry() { return new SimpleMeterRegistry(); }
        @Bean com.predicador.reporting.repository.WhatsAppDeliveryRepository deliveryRepository() {
            return mock(com.predicador.reporting.repository.WhatsAppDeliveryRepository.class);
        }
        @Bean TransactionTemplate txTemplate() { return mock(TransactionTemplate.class); }
        @Bean ReportSendService reportSendService(ReportMessageService messageService,
                com.predicador.reporting.client.WhatsAppMediaClient mediaClient,
                WhatsAppMessageClient messageClient, WhatsAppProperties properties,
                MeterRegistry registry,
                com.predicador.reporting.repository.WhatsAppDeliveryRepository deliveryRepository,
                TransactionTemplate txTemplate) {
            return new ReportSendService(messageService, mediaClient, messageClient, properties, registry,
                    deliveryRepository, txTemplate);
        }
    }
}
