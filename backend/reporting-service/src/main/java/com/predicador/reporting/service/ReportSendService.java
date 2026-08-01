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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Service
public class ReportSendService {

    private static final Logger log = LoggerFactory.getLogger(ReportSendService.class);
    private static final String DEFAULT_IMAGE_URL =
        "https://res.cloudinary.com/g2opllmf/image/upload/v1785035850/Gemini_Generated_Image_ru504bru504bru50_czjivy.png";

    private final ReportMessageService messageService;
    private final WhatsAppMediaClient mediaClient;
    private final WhatsAppMessageClient messageClient;
    private final WhatsAppProperties props;
    private final MeterRegistry registry;
    private final WhatsAppDeliveryRepository deliveryRepository;

    public ReportSendService(
            ReportMessageService messageService,
            WhatsAppMediaClient mediaClient,
            WhatsAppMessageClient messageClient,
            WhatsAppProperties props,
            MeterRegistry registry) {
        this(messageService, mediaClient, messageClient, props, registry, null);
    }

    public ReportSendService(
            ReportMessageService messageService,
            WhatsAppMediaClient mediaClient,
            WhatsAppMessageClient messageClient,
            WhatsAppProperties props,
            MeterRegistry registry,
            WhatsAppDeliveryRepository deliveryRepository) {
        this.messageService = messageService;
        this.mediaClient = mediaClient;
        this.messageClient = messageClient;
        this.props = props;
        this.registry = registry;
        this.deliveryRepository = deliveryRepository;
    }

    public WhatsAppSendResponse sendReport(WhatsAppSendRequest request) {
        return sendReport(request, null);
    }

    public WhatsAppSendResponse sendReport(WhatsAppSendRequest request, String idempotencyKey) {
        if (idempotencyKey != null && !idempotencyKey.isBlank() && deliveryRepository != null) {
            Optional<WhatsAppDelivery> previous = deliveryRepository.findById(idempotencyKey);
            if (previous.isPresent()) return toResponse(previous.get());
            try {
                deliveryRepository.saveAndFlush(new WhatsAppDelivery(idempotencyKey));
            } catch (org.springframework.dao.DataIntegrityViolationException duplicate) {
                return deliveryRepository.findById(idempotencyKey).map(this::toResponse).orElseThrow();
            }
        }
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

            String messageId = response.stableMessageId();
            log.info("WhatsApp delivery outcome=success message_id_hash={}", Integer.toHexString(messageId.hashCode()));

            Counter.builder("whatsapp.send.total")
                    .description("Total de mensajes WhatsApp enviados")
                    .register(registry)
                    .increment();
            Counter.builder("whatsapp.send.success")
                    .description("Mensajes WhatsApp enviados exitosamente")
                    .register(registry)
                    .increment();

            WhatsAppSendResponse result = new WhatsAppSendResponse(true, messageId, null);
            persistResult(idempotencyKey, result);
            return result;

        } catch (com.predicador.reporting.client.WhatsAppIntegrationException e) {
            Counter.builder("whatsapp.send.total")
                    .description("Total de mensajes WhatsApp enviados")
                    .register(registry)
                    .increment();
            Counter.builder("whatsapp.send.failure")
                    .description("Mensajes WhatsApp con error")
                    .register(registry)
                    .increment();
            WhatsAppSendResponse result = new WhatsAppSendResponse(false, null, e.getMessage());
            persistResult(idempotencyKey, result);
            throw e;
        } finally {
            long elapsed = System.nanoTime() - start;
            Timer.builder("whatsapp.send.duration")
                    .description("Tiempo total de envío WhatsApp")
                    .register(registry)
                    .record(elapsed, TimeUnit.NANOSECONDS);
        }
    }

    private void persistResult(String idempotencyKey, WhatsAppSendResponse result) {
        if (idempotencyKey == null || idempotencyKey.isBlank() || deliveryRepository == null) return;
        WhatsAppDelivery delivery = deliveryRepository.findById(idempotencyKey).orElseThrow();
        delivery.setSuccess(result.success());
        delivery.setMessageId(result.messageId());
        delivery.setError(result.error());
        deliveryRepository.save(delivery);
    }

    private WhatsAppSendResponse toResponse(WhatsAppDelivery delivery) {
        return new WhatsAppSendResponse(delivery.isSuccess(), delivery.getMessageId(), delivery.getError());
    }

    private String normalizePhone(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 9 && digits.startsWith("9")) {
            return "56" + digits;
        }
        return digits;
    }
}
