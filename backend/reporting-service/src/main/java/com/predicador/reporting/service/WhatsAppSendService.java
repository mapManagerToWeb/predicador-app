package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.client.WhatsAppMessageResponse;
import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executor;

/**
 * Orquestador del envío asíncrono de reportes por WhatsApp.
 *
 * <p>{@link #submit} registra la intención de envío y devuelve de inmediato un
 * estado {@code IN_PROGRESS}, mientras el trabajo real (subir imagen y mandar
 * la plantilla) corre en {@code whatsAppSendExecutor}. El cliente consulta el
 * resultado con {@link #getStatus} hasta que el envío se complete.</p>
 *
 * <p>{@link #sendTemplateMessage} procesa mensajes consumidos de la cola
 * RabbitMQ: el emisor ya armó los {@code components} de la plantilla, así que
 * el servicio solo aplica la idempotencia por clave y delega el envío en
 * {@link WhatsAppMessageClient}.</p>
 *
 * <p>Al sustituir el envío síncrono por asíncrono, la petición HTTP no se queda
 * bloqueada durante llamadas lentas a WhatsApp, evitando que el gateway corte
 * por timeout y devuelva 503 (circuit breaker abierto).</p>
 */
@Service
public class WhatsAppSendService {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendService.class);

    private static final Duration DELIVERY_LEASE = Duration.ofMinutes(5);

    private final ReportSendService sendService;
    private final WhatsAppMessageClient messageClient;
    private final WhatsAppDeliveryRepository deliveryRepository;
    private final TransactionTemplate txTemplate;
    private final Executor executor;

    public WhatsAppSendService(ReportSendService sendService,
                               WhatsAppMessageClient messageClient,
                               WhatsAppDeliveryRepository deliveryRepository,
                               TransactionTemplate txTemplate,
                               @Qualifier("whatsAppSendExecutor") Executor executor) {
        this.sendService = sendService;
        this.messageClient = messageClient;
        this.deliveryRepository = deliveryRepository;
        this.txTemplate = txTemplate;
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

    /**
     * Procesa un mensaje consumido de la cola RabbitMQ aplicando idempotencia
     * por clave. Si la entrega ya terminó no reenvía; si el lease está activo
     * responde 409; si quedó huérfana (lease vencido) la reclama y envía.
     */
    public void sendTemplateMessage(String idempotencyKey, String destinationNumber,
                                    String templateName, String languageCode,
                                    List<Map<String, Object>> components) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new WhatsAppIntegrationException(
                    "Se requiere Idempotency-Key para el envío por cola", 400, null);
        }
        Instant now = Instant.now();
        Optional<WhatsAppDelivery> previous = find(idempotencyKey);
        if (previous.isPresent()) {
            WhatsAppDelivery delivery = previous.get();
            if (delivery.isCompleted()) {
                return;
            }
            if (delivery.isLeaseActive(now)) {
                throw new WhatsAppIntegrationException(
                        "El envío con esta clave está en progreso", 409, null);
            }
            claimStale(idempotencyKey, now);
            delivery = find(idempotencyKey).orElse(delivery);
            sendRaw(idempotencyKey, delivery, destinationNumber, templateName, languageCode, components);
            return;
        }
        sendRaw(idempotencyKey, newDelivery(idempotencyKey), destinationNumber,
                templateName, languageCode, components);
    }

    /** Trabajo en segundo plano: delega en el servicio que persiste el resultado. */
    void process(WhatsAppSendRequest request, String idempotencyKey) {
        try {
            sendService.sendReport(request, idempotencyKey);
        } catch (WhatsAppIntegrationException exception) {
            log.debug("Envío WhatsApp finalizado con error key={} status={}",
                    idempotencyKey, exception.status());
        } catch (RuntimeException exception) {
            log.error("Error inesperado durante el envío WhatsApp key={}", idempotencyKey, exception);
        }
    }

    private void sendRaw(String idempotencyKey, WhatsAppDelivery delivery, String destinationNumber,
                         String templateName, String languageCode, List<Map<String, Object>> components) {
        try {
            WhatsAppMessageResponse response = messageClient.sendTemplateMessage(
                    destinationNumber, templateName, languageCode, components);
            if (response == null || response.stableMessageId() == null || response.stableMessageId().isBlank()) {
                throw new WhatsAppIntegrationException(
                        "WhatsApp devolvió una respuesta sin message id", 502, null);
            }
            delivery.markSucceeded(response.stableMessageId());
            deliveryRepository.save(delivery);
        } catch (WhatsAppIntegrationException exception) {
            delivery.markFailed(exception.getMessage(), exception.status());
            deliveryRepository.save(delivery);
            throw exception;
        } catch (RuntimeException exception) {
            delivery.markFailed(exception.getMessage() != null ? exception.getMessage() : "Error inesperado", 502);
            deliveryRepository.save(delivery);
            throw new WhatsAppIntegrationException("Fallo inesperado durante el envío WhatsApp", 502, exception);
        }
    }

    private WhatsAppDelivery newDelivery(String idempotencyKey) {
        try {
            return deliveryRepository.saveAndFlush(new WhatsAppDelivery(idempotencyKey));
        } catch (DataIntegrityViolationException duplicate) {
            Optional<WhatsAppDelivery> raced;
            try {
                raced = txTemplate.execute(status -> deliveryRepository.findById(idempotencyKey));
            } catch (DataAccessException exception) {
                throw databaseFailure(exception);
            }
            if (raced.isEmpty()) {
                throw databaseFailure(duplicate);
            }
            return raced.get();
        } catch (DataAccessException exception) {
            throw databaseFailure(exception);
        }
    }

    private void claimStale(String idempotencyKey, Instant now) {
        try {
            int claimed = deliveryRepository.claimStale(
                    idempotencyKey, WhatsAppDeliveryStatus.IN_PROGRESS, now, now.plus(DELIVERY_LEASE));
            if (claimed != 1) {
                throw new WhatsAppIntegrationException("No se pudo reservar el envío", 409, null);
            }
        } catch (DataAccessException exception) {
            throw databaseFailure(exception);
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

    private WhatsAppIntegrationException databaseFailure(Exception exception) {
        return new WhatsAppIntegrationException(
                "No se pudo reservar el envío por un error de persistencia", 503, exception);
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
