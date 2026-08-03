package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppDeliveryDto;
import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.service.WhatsAppSendService;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.client.WhatsAppIntegrationException;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ReportControllerSendTest {

    private MockMvc mockMvc;

    @Mock
    private WhatsAppSendService whatsAppSendService;

    @Mock
    private ReportService reportService;

    private ReportController reportController;

    private final SessionToken owner = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);

    @BeforeEach
    void setUp() {
        reportController = new ReportController(reportService, whatsAppSendService, new AuthorizationService());
        mockMvc = MockMvcBuilders.standaloneSetup(reportController)
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler())
                .build();
    }

    private static final String PAYLOAD = """
        {
          "encargadoNombre": "Daniel",
          "encargadoApellido": "Uribe",
          "fechaRegistro": "21-07-2026",
          "territorios": [
            {"numero": 1, "finalizado": true, "totalManzanas": 12, "manzanasMarcadas": 12}
          ],
          "screenshotBase64": null,
          "destinationNumber": null
        }
        """;

    @Test
    void sendWhatsAppReport_returns202AcceptedWhileInProgress() throws Exception {
        when(whatsAppSendService.submit(any(WhatsAppSendRequest.class), isNull()))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "IN_PROGRESS", null, null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner)
                .content(PAYLOAD))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }

    @Test
    void sendWhatsAppReport_completedKey_replays200() throws Exception {
        when(whatsAppSendService.submit(any(WhatsAppSendRequest.class), isNull()))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "SUCCEEDED", "msg_123", null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner)
                .content(PAYLOAD))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUCCEEDED"))
            .andExpect(jsonPath("$.messageId").value("msg_123"));
    }

    @Test
    void sendWhatsAppReport_withoutToken_shouldReturn403ProblemDetail() throws Exception {
        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content(PAYLOAD))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.status").value(403))
            .andExpect(jsonPath("$.title").value("Acceso denegado"));

        verify(whatsAppSendService, never()).submit(any(WhatsAppSendRequest.class), any());
    }

    @Test
    void sendWhatsAppReport_submitFailure_shouldHandleError() throws Exception {
        when(whatsAppSendService.submit(any(WhatsAppSendRequest.class), isNull()))
                .thenThrow(new WhatsAppIntegrationException("Token invalido", 502, null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner)
                .content(PAYLOAD))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.title").value("Fallo en la integración WhatsApp"));
    }

    @Test
    void getSendStatus_returnsCurrentStatus() throws Exception {
        when(whatsAppSendService.getStatus("key-1"))
                .thenReturn(new WhatsAppDeliveryDto("key-1", "FAILED", null, "Meta rejected"));

        mockMvc.perform(get("/api/v1/reports/send/key-1")
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("FAILED"))
            .andExpect(jsonPath("$.error").value("Meta rejected"));
    }
}
