package com.predicador.reporting.service;

import com.predicador.reporting.client.WhatsAppMediaClient;
import com.predicador.reporting.client.WhatsAppMessageClient;
import com.predicador.reporting.client.WhatsAppMessageResponse;
import com.predicador.reporting.config.WhatsAppProperties;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.repository.WhatsAppDeliveryRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DataAccessException;
import java.util.concurrent.TimeUnit;

@Service
public class ReportSendService {

    private static final Logger log = LoggerFactory.getLogger(ReportSendService.class);
    private static final String DEFAULT_IMAGE_URL =
        "https://res.cloudinary.com/g2opllmf/image/upload/v1785035850/Gemini_Generated_Image_ru504bru504bru50_czjivy.png";
    private static final Duration DELIVERY_LEASE = Duration.ofMinutes(5);

    private final ReportMessageService messageService;
    private final WhatsAppMediaClient mediaClient;
    private final WhatsAppMessageClient messageClient;
    private final WhatsAppProperties props;
    private final WhatsAppDeliveryRepository deliveryRepository;
    private final TransactionTemplate txTemplate;
    private final Counter sendTotal;
    private final Counter sendSuccess;
    private final Counter sendFailure;
    private final Timer sendTimer;

    public ReportSendService(
            ReportMessageService messageService,
            WhatsAppMediaClient mediaClient,
            WhatsAppMessageClient messageClient,
            WhatsAppProperties props,
            MeterRegistry registry,
            WhatsAppDeliveryRepository deliveryRepository,
            TransactionTemplate txTemplate) {
        this.messageService = messageService;
        this.mediaClient = mediaClient;
        this.messageClient = messageClient;
        this.props = props;
        this.deliveryRepository = deliveryRepository;
        this.txTemplate = txTemplate;
        this.sendTotal = Counter.builder("whatsapp.send.total")
                .description("Total de mensajes WhatsApp enviados")
                .register(registry);
        this.sendSuccess = Counter.builder("whatsapp.send.success")
                .description("Mensajes WhatsApp enviados exitosamente")
                .register(registry);
        this.sendFailure = Counter.builder("whatsapp.send.failure")
                .description("Mensajes WhatsApp con error")
                .register(registry);
        this.sendTimer = Timer.builder("whatsapp.send.duration")
                .description("Tiempo total de envío WhatsApp")
                .register(registry);
    }

    public WhatsAppSendResponse sendReport(WhatsAppSendRequest request) {
        return sendReport(request, null);
    }

    public WhatsAppSendResponse sendReport(WhatsAppSendRequest request, String idempotencyKey) {
        Reservation reservation = reserve(idempotencyKey);
        if (reservation.replay() != null) return reservation.replay();
        WhatsAppDelivery delivery = reservation.delivery();
        long start = System.nanoTime();
        try {
            Map<String, String> templateParams = messageService.generarParametrosTemplate(request);

            List<Map<String, Object>> components = new ArrayList<>();

            if (request.screenshotBase64() != null) {
                String mediaId = mediaClient.uploadImage(
                    request.screenshotBase64(), "image/jpeg");

                components.add(Map.of(
                    "type", "header",
                    "parameters", List.of(
                        Map.of(
                            "type", "image",
                            "image", Map.of("id", mediaId)
                        )
                    )
                ));
            } else {
                components.add(Map.of(
                    "type", "header",
                    "parameters", List.of(
                        Map.of(
                            "type", "image",
                            "image", Map.of("link", DEFAULT_IMAGE_URL)
                        )
                    )
                ));
            }

            List<Map<String, Object>> bodyParams = List.of(
                Map.of("type", "text", "parameter_name", "fecha_registro",
                       "text", templateParams.get("fecha")),
                Map.of("type", "text", "parameter_name", "nombre_encargado",
                       "text", templateParams.get("encargado")),
                Map.of("type", "text", "parameter_name", "numero_territorio",
                       "text", templateParams.get("territorio")),
                Map.of("type", "text", "parameter_name", "detalle_estado",
                       "text", templateParams.get("estado"))
            );

            components.add(Map.of("type", "body", "parameters", bodyParams));

            String destination = request.destinationNumber() != null
                ? normalizePhone(request.destinationNumber())
                : props.destinationNumber();

            WhatsAppMessageResponse response = messageClient.sendTemplateMessage(
                    destination, props.templateName(), props.languageCode(), components);

            if (response == null || response.stableMessageId() == null || response.stableMessageId().isBlank()) {
                throw new com.predicador.reporting.client.WhatsAppIntegrationException(
                        "WhatsApp devolvió una respuesta sin message id", 502, null);
            }
            String messageId = response.stableMessageId();
            log.info("WhatsApp delivery outcome=success");

            sendTotal.increment();
            sendSuccess.increment();

            WhatsAppSendResponse result = new WhatsAppSendResponse(true, messageId, null);
            persistSuccess(delivery, result);
            return result;

        } catch (com.predicador.reporting.client.WhatsAppIntegrationException e) {
            sendTotal.increment();
            sendFailure.increment();
            WhatsAppSendResponse result = new WhatsAppSendResponse(false, null, e.getMessage());
            persistFailure(delivery, result, e.status());
            throw e;
        } finally {
            long elapsed = System.nanoTime() - start;
            sendTimer.record(elapsed, TimeUnit.NANOSECONDS);
        }
    }

    Reservation reserve(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) return new Reservation(null, null);
        Instant now = Instant.now();
        Optional<WhatsAppDelivery> previous;
        try {
            previous = deliveryRepository.findById(idempotencyKey);
        } catch (DataAccessException exception) {
            throw databaseFailure(exception);
        }
        if (previous.isPresent()) {
            return resolveExisting(idempotencyKey, previous.get(), now);
        }
        try {
            return new Reservation(deliveryRepository.saveAndFlush(new WhatsAppDelivery(idempotencyKey)), null);
        } catch (org.springframework.dao.DataIntegrityViolationException duplicate) {
            Optional<WhatsAppDelivery> raced;
            try {
                raced = txTemplate.execute(status -> deliveryRepository.findById(idempotencyKey));
            } catch (DataAccessException exception) {
                throw databaseFailure(exception);
            }
            if (raced.isEmpty()) throw databaseFailure(duplicate);
            return resolveExisting(idempotencyKey, raced.get(), now);
        } catch (DataAccessException exception) {
            throw databaseFailure(exception);
        }
    }

    private Reservation resolveExisting(String idempotencyKey, WhatsAppDelivery delivery, Instant now) {
        if (delivery.isCompleted()) return new Reservation(delivery, replay(delivery));
        if (delivery.isLeaseActive(now)) {
            throw new com.predicador.reporting.client.WhatsAppIntegrationException(
                    "El envío con esta clave está en progreso", 409, null);
        }
        try {
            if (deliveryRepository.claimStale(idempotencyKey,
                    com.predicador.reporting.model.WhatsAppDeliveryStatus.IN_PROGRESS,
                    now, now.plus(DELIVERY_LEASE)) != 1) {
                throw new com.predicador.reporting.client.WhatsAppIntegrationException(
                        "No se pudo reservar el envío", 409, null);
            }
        } catch (DataAccessException exception) {
            throw databaseFailure(exception);
        }
        delivery.renewLease(now.plus(DELIVERY_LEASE));
        return new Reservation(delivery, null);
    }

    private com.predicador.reporting.client.WhatsAppIntegrationException databaseFailure(Exception exception) {
        return new com.predicador.reporting.client.WhatsAppIntegrationException(
                "No se pudo reservar el envío por un error de persistencia", 503, exception);
    }

    private void persistSuccess(WhatsAppDelivery delivery, WhatsAppSendResponse result) {
        if (delivery == null) return;
        delivery.markSucceeded(result.messageId());
        deliveryRepository.save(delivery);
    }

    private void persistFailure(WhatsAppDelivery delivery, WhatsAppSendResponse result, int status) {
        if (delivery == null) return;
        delivery.markFailed(result.error(), status);
        deliveryRepository.save(delivery);
    }

    private WhatsAppSendResponse replay(WhatsAppDelivery delivery) {
        if (delivery.getStatus() == com.predicador.reporting.model.WhatsAppDeliveryStatus.FAILED) {
            throw new com.predicador.reporting.client.WhatsAppIntegrationException(
                    delivery.getError(), delivery.getStatusCode() == null ? 502 : delivery.getStatusCode(), null);
        }
        return new WhatsAppSendResponse(true, delivery.getMessageId(), null);
    }

    private record Reservation(WhatsAppDelivery delivery, WhatsAppSendResponse replay) {}

    private String normalizePhone(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 9 && digits.startsWith("9")) {
            return "56" + digits;
        }
        return digits;
    }
}
