package com.predicador.reporting.client;

import com.predicador.reporting.config.WhatsAppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class Task3WhatsAppClientTest {

    private static final String MESSAGES_URL = "https://graph.example/v1/phone/messages";
    private static final String MEDIA_URL = "https://graph.example/v1/phone/media";

    private WhatsAppProperties props() {
        var props = mock(WhatsAppProperties.class);
        when(props.baseUrl()).thenReturn("https://graph.example");
        when(props.apiVersion()).thenReturn("v1");
        when(props.phoneNumberId()).thenReturn("phone");
        return props;
    }

    @Test
    void messageClientRejectsSuccessfulResponseWithoutMessageId() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var restClient = builder.build();

        server.expect(requestTo(MESSAGES_URL))
              .andExpect(method(HttpMethod.POST))
              .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        var client = new WhatsAppMessageClient(restClient, props());

        assertThrows(WhatsAppIntegrationException.class,
                () -> client.sendTemplateMessage("56912345678", "template", "es_CL", java.util.List.of()));
        server.verify();
    }

    @Test
    void mediaClientRejectsSuccessfulResponseWithoutMediaId() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var restClient = builder.build();

        server.expect(requestTo(MEDIA_URL))
              .andExpect(method(HttpMethod.POST))
              .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        var client = new WhatsAppMediaClient(restClient, props());

        assertThrows(WhatsAppIntegrationException.class,
                () -> client.uploadImage("aGVsbG8=", "image/jpeg"));
        server.verify();
    }
}