package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class Task3WhatsAppClientTest {
    @Test
    void messageClientRejectsSuccessfulResponseWithoutMessageId() {
        var rest = mock(RestTemplate.class);
        var props = mock(WhatsAppProperties.class);
        when(props.baseUrl()).thenReturn("https://graph.example");
        when(props.apiVersion()).thenReturn("v1");
        when(props.phoneNumberId()).thenReturn("phone");
        when(rest.exchange(anyString(), eq(HttpMethod.POST), any(), eq(WhatsAppMessageResponse.class)))
                .thenReturn(ResponseEntity.ok(new WhatsAppMessageResponse(null, null)));

        var client = new WhatsAppMessageClient(rest, props);

        assertThrows(WhatsAppIntegrationException.class,
                () -> client.sendTemplateMessage("56912345678", "template", "es_CL", java.util.List.of()));
    }

    @Test
    void mediaClientRejectsSuccessfulResponseWithoutMediaId() {
        var rest = mock(RestTemplate.class);
        var props = mock(WhatsAppProperties.class);
        when(props.baseUrl()).thenReturn("https://graph.example");
        when(props.apiVersion()).thenReturn("v1");
        when(props.phoneNumberId()).thenReturn("phone");
        when(rest.exchange(anyString(), eq(HttpMethod.POST), any(), eq(WhatsAppMediaResponse.class)))
                .thenReturn(ResponseEntity.ok(new WhatsAppMediaResponse(null)));

        var client = new WhatsAppMediaClient(rest, props);

        assertThrows(WhatsAppIntegrationException.class,
                () -> client.uploadImage("aGVsbG8=", "image/jpeg"));
    }
}
