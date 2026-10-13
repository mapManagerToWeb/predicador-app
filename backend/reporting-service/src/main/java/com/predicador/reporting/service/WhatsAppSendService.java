package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.Executor;

/**
 * Orquestador del envío asíncrono de reportes por WhatsApp.
 *
 * <p>{@link #submit} registra la intención de envío y devuelve de inmediato un
 * estado {@code IN_PROGRESS}, mientras el trabajo real (subir imagen y mandar
 * la plantilla) corre en {@code whatsAppSendExecutor} a través de
 * {@link ReportSendService}. El cliente consulta el resultado con
 * {@link #getStatus} hasta que el envío se complete.</p>
 *
 * <p>Ya NO existe un camino de envío por cola RabbitMQ. El endpoint
 * {@code POST /api/v1/reports/whatsapp/async} y su listener se eliminaron:
 * confiaban en el {@code destinationNumber}, {@code templateName},
 * {@code languageCode} y {@code components} que enviaba el cliente, así que
 * cualquier usuario registrado podía mandar desde las credenciales de Meta de
 * la congregación a un número arbitrario con una plantilla arbitraria (C1,
 * cerrado en la ronda 2 de ADR 0016). El destino, la plantilla y el idioma los
 * decide ahora exclusivamente {@link com.predicador.reporting.config.WhatsAppProperties}.</p>
 *
 * <p>Al sustituir el envío síncrono por asíncrono, la petición HTTP no se queda
 * bloqueada durante llamadas lentas a WhatsApp, evitando que el gateway corte
 * por timeout y devuelva 503 (circuit breaker abierto).</p>
 */
@Service
public class WhatsAppSendService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendService.class);

    private final ReportSendService sendService;
    private final WhatsAppDeliveryRepository deliveryRepository;
    private final Executor executor;

    public WhatsAppSendService(ReportSendService sendService,
                               WhatsAppDeliveryRepository deliveryRepository,
                               @Qualifier("whatsAppSendExecutor") Executor executor) {
        this.sendService = sendService;
        this.deliveryRepository = deliveryRepository;
        this.executor = executor;
    }

    /**
     * Registra y programa el envío. Si ya existe una entrega terminada para la
     * clave, devuelve su resultado en lugar de reenviar.
     */
    public WhatsAppDeliveryDto submit(WhatsAppSendRequest request, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new WhatsAppIntegrationException(
                    "Se requiere Idempotency-Key para el envío asíncrono", 400, null);
        }
        Optional<WhatsAppDelivery> existing = find(idempotencyKey);
        if (existing.isPresent()) {
            return toDto(existing.get());
        }
        executor.execute(() -> process(request, idempotencyKey));
        return new WhatsAppDeliveryDto(idempotencyKey, WhatsAppDeliveryStatus.IN_PROGRESS.name(), null, null);
    }

    /** Devuelve el estado actual de un envío. */
    public WhatsAppDeliveryDto getStatus(String idempotencyKey) {
        Optional<WhatsAppDelivery> existing = find(idempotencyKey);
        return existing
                .map(this::toDto)
                .orElseGet(() -> new WhatsAppDeliveryDto(
                        idempotencyKey, WhatsAppDeliveryStatus.IN_PROGRESS.name(), null, null));
    }

    /** Trabajo en segundo plano: delega en el servicio que persiste el resultado. */
    void process(WhatsAppSendRequest request, String idempotencyKey) {
        try {
            sendService.sendReport(request, idempotencyKey);
        } catch (WhatsAppIntegrationException exception) {
            log.debug("Envío WhatsApp finalizado con error key={} status={} cause={}",
                    idempotencyKey, exception.status(),
                    exception.getCause() != null ? exception.getCause().getClass().getSimpleName() : "none");
        } catch (RuntimeException exception) {
            log.error("Error inesperado durante el envío WhatsApp key={} type={} cause={}",
                    idempotencyKey, exception.getClass().getSimpleName(),
                    exception.getCause() != null ? exception.getCause().getClass().getSimpleName() : "none",
                    exception);
            terminalizeUnexpectedFailure(idempotencyKey, exception);
        }
    }

    /**
     * Garantiza que un envío que falló con un error inesperado (no
     * {@link WhatsAppIntegrationException}) termine en estado {@code FAILED}.
     * Sin esto la entrega quedaría {@code IN_PROGRESS} para siempre y el
     * cliente esperaría un timeout en lugar de recibir el error real.
     */
    private void terminalizeUnexpectedFailure(String idempotencyKey, RuntimeException exception) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) return;
        try {
            find(idempotencyKey).ifPresent(delivery -> {
                if (!delivery.isCompleted()) {
                    delivery.markFailed(
                            exception.getMessage() != null ? exception.getMessage() : "Error inesperado durante el envío",
                            502);
                    deliveryRepository.save(delivery);
                }
            });
        } catch (WhatsAppIntegrationException ignored) {
            log.warn("No se pudo registrar el fallo inesperado del envío key={}", idempotencyKey);
        }
    }

    private Optional<WhatsAppDelivery> find(String idempotencyKey) {
        try {
            return deliveryRepository.findById(idempotencyKey);
        } catch (DataAccessException exception) {
            throw new WhatsAppIntegrationException(
                    "No se pudo consultar el estado del envío", 503, exception);
        }
    }

    private WhatsAppDeliveryDto toDto(WhatsAppDelivery delivery) {
        String error = delivery.getStatus() == WhatsAppDeliveryStatus.FAILED
                ? delivery.getError() : null;
        return new WhatsAppDeliveryDto(
                delivery.getIdempotencyKey(),
                delivery.getStatus().name(),
                delivery.getMessageId(),
                error);
    }
}
