package com.predicador.reporting.listener;

import com.predicador.reporting.config.RabbitMQConfig;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import com.predicador.reporting.service.WhatsAppSendService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class WhatsAppSendListener {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendListener.class);

    private final WhatsAppSendService whatsAppSendService;

    public WhatsAppSendListener(WhatsAppSendService whatsAppSendService) {
        this.whatsAppSendService = whatsAppSendService;
    }

    @RabbitListener(queues = RabbitMQConfig.WHATSAPP_SEND_QUEUE)
    public void onMessage(WhatsAppMessageRequest request) {
        log.info("Procesando mensaje WhatsApp desde cola key={}", request.idempotencyKey());

        whatsAppSendService.sendTemplateMessage(
                request.idempotencyKey(),
                request.destinationNumber(),
                request.templateName(),
                request.languageCode(),
                request.components()
        );
    }
}