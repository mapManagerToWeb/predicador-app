package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.util.Base64;
import java.util.Map;

@Component
public class WhatsAppMediaClient {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppMediaClient.class);
    private final RestTemplate restTemplate;
    private final WhatsAppProperties props;

    public WhatsAppMediaClient(RestTemplate restTemplate, WhatsAppProperties props) {
        this.restTemplate = restTemplate;
        this.props = props;
    }

    public String uploadImage(String base64Image, String mimeType) {
        String url = String.format("%s/%s/%s/media",
                props.baseUrl(), props.apiVersion(), props.phoneNumberId());

        byte[] imageBytes = Base64.getDecoder().decode(base64Image);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.setBearerAuth(props.accessToken());

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("messaging_product", "whatsapp");
        body.add("type", mimeType);
        body.add("file", new ByteArrayResource(imageBytes) {
            @Override
            public String getFilename() {
                return "screenshot.jpg";
            }
        });

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<WhatsAppMediaResponse> response = restTemplate.exchange(
                    url, HttpMethod.POST, request, WhatsAppMediaResponse.class);
            WhatsAppMediaResponse responseBody = response.getBody();
            if (responseBody == null || responseBody.id() == null || responseBody.id().isBlank()) {
                throw new WhatsAppIntegrationException("WhatsApp devolvió una respuesta sin media id", 502, null);
            }
            String mediaId = responseBody.id();
            log.info("Screenshot upload outcome=success");
            return mediaId;
        } catch (RestClientResponseException exception) {
            throw new WhatsAppIntegrationException("WhatsApp respondió con error al subir imagen",
                    exception.getStatusCode().value(), exception);
        } catch (ResourceAccessException exception) {
            throw new WhatsAppIntegrationException("Timeout al subir imagen a WhatsApp", 504, exception);
        }
    }
}
