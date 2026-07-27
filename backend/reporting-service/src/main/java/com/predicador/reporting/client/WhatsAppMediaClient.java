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

    @SuppressWarnings("unchecked")
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
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, request, Map.class);
            Map<String, Object> responseBody = response.getBody();
            String mediaId = (String) responseBody.get("id");
            log.info("Screenshot subido a Meta, media_id: {}", mediaId);
            return mediaId;
        } catch (Exception e) {
            log.error("Error subiendo screenshot a Meta: {}", e.getMessage());
            throw new RuntimeException("Error subiendo imagen a Meta", e);
        }
    }
}
