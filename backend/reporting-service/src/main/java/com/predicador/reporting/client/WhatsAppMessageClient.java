package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

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

    @SuppressWarnings("unchecked")
    public Map<String, Object> sendTemplateMessage(
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

        log.info("Enviando mensaje WhatsApp a {}", destinationNumber);

        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, request, Map.class);
        return response.getBody();
    }
}
