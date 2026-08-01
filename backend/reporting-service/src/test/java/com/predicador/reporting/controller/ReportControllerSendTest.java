package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.service.ReportSendService;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ReportControllerSendTest {

    private MockMvc mockMvc;

    @Mock
    private ReportSendService reportSendService;

    @Mock
    private ReportService reportService;

    private ReportController reportController;

    private final SessionToken owner = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);

    @BeforeEach
    void setUp() {
        reportController = new ReportController(reportService, reportSendService, new AuthorizationService());
        mockMvc = MockMvcBuilders.standaloneSetup(reportController)
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler())
                .build();
    }

    @Test
    void sendWhatsAppReport_shouldReturn200() throws Exception {
        WhatsAppSendResponse response = new WhatsAppSendResponse(true, "msg_123", null);
        when(reportSendService.sendReport(any(WhatsAppSendRequest.class), isNull())).thenReturn(response);

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner)
                .content("""
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
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.messageId").value("msg_123"));
    }

    @Test
    void sendWhatsAppReport_withoutToken_shouldReturn403ProblemDetail() throws Exception {
        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "encargadoNombre": "Daniel",
                      "fechaRegistro": "21-07-2026",
                      "territorios": [{"numero": 1, "finalizado": true, "totalManzanas": 12, "manzanasMarcadas": 12}]
                    }
                    """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Acceso denegado"));

        verify(reportSendService, never()).sendReport(any(WhatsAppSendRequest.class), any());
    }

    @Test
    void sendWhatsAppReport_shouldHandleError() throws Exception {
        when(reportSendService.sendReport(any(WhatsAppSendRequest.class), isNull()))
                .thenThrow(new WhatsAppIntegrationException("Token invalido", 502, null));

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner)
                .content("""
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
                    """))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.title").value("Fallo en la integración WhatsApp"));
    }
}
