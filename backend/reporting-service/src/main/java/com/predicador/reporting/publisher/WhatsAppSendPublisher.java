package com.predicador.reporting.publisher;

import com.predicador.reporting.config.RabbitMQConfig;
import com.predicador.reporting.dto.WhatsAppMessageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

@Service
public class WhatsAppSendPublisher {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSendPublisher.class);

    private final RabbitTemplate rabbitTemplate;

    public WhatsAppSendPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publish(WhatsAppMessageRequest request) {
        log.info("Publicando envío WhatsApp a cola key={}", request.idempotencyKey());
        rabbitTemplate.convertAndSend(
                RabbitMQConfig.WHATSAPP_SEND_EXCHANGE,
                RabbitMQConfig.WHATSAPP_SEND_ROUTING_KEY,
                request
        );
    }
}