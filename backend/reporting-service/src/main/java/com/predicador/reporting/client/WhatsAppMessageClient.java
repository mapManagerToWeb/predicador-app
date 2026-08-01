package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;

@Component
public class WhatsAppMessageClient {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppMessageClient.class);
    private final RestTemplate restTemplate;
    private final WhatsAppProperties props;

    public WhatsAppMessageClient(RestTemplate restTemplate, WhatsAppProperties props) {
        this.restTemplate = restTemplate;
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

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(props.accessToken());

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

        log.info("Enviando mensaje WhatsApp outcome=pending");
        try {
            ResponseEntity<WhatsAppMessageResponse> response = restTemplate.exchange(
                    url, HttpMethod.POST, request, WhatsAppMessageResponse.class);
            WhatsAppMessageResponse body = response.getBody();
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
