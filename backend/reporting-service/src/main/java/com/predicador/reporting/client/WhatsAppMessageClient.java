package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

@Component
public class WhatsAppMessageClient {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppMessageClient.class);
    private final RestClient restClient;
    private final WhatsAppProperties props;

    public WhatsAppMessageClient(RestClient restClient, WhatsAppProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    public WhatsAppMessageResponse sendTemplateMessage(
            String destinationNumber,
            String templateName,
            String languageCode,
            List<Map<String, Object>> components) {

        String url = String.format("%s/%s/%s/messages",
                props.baseUrl(), props.apiVersion(), props.phoneNumberId());

        Map<String, Object> payload = Map.of(
            "messaging_product", "whatsapp",
            "to", destinationNumber,
            "type", "template",
            "template", Map.of(
                "name", templateName,
                "language", Map.of("code", languageCode),
                "components", components
            )
        );

        log.info("Enviando mensaje WhatsApp outcome=pending");
        try {
            WhatsAppMessageResponse body = restClient.post()
                    .uri(url)
                    .headers(h -> {
                        h.setContentType(MediaType.APPLICATION_JSON);
                        h.setBearerAuth(props.accessToken());
                    })
                    .body(payload)
                    .retrieve()
                    .body(WhatsAppMessageResponse.class);
            if (body == null || body.stableMessageId() == null || body.stableMessageId().isBlank()) {
                throw new WhatsAppIntegrationException("WhatsApp devolvió una respuesta sin message id", 502, null);
            }
            return body;
        } catch (RestClientResponseException exception) {
            throw new WhatsAppIntegrationException("WhatsApp respondió con error", exception.getStatusCode().value(), exception);
        } catch (ResourceAccessException exception) {
            throw new WhatsAppIntegrationException("Timeout al contactar WhatsApp", 504, exception);
        }
    }
}
