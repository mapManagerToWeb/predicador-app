package com.predicador.reporting.controller;

import com.predicador.reporting.dto.WhatsAppSendRequest;
import com.predicador.reporting.dto.WhatsAppSendResponse;
import com.predicador.reporting.service.ReportSendService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ReportControllerSendTest {

    private MockMvc mockMvc;

    @Mock
    private ReportSendService reportSendService;

    @InjectMocks
    private ReportController reportController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(reportController).build();
    }

    @Test
    void sendWhatsAppReport_shouldReturn200() throws Exception {
        WhatsAppSendResponse response = new WhatsAppSendResponse(true, "msg_123", null);
        when(reportSendService.sendReport(any(WhatsAppSendRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
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
    void sendWhatsAppReport_shouldHandleError() throws Exception {
        WhatsAppSendResponse response = new WhatsAppSendResponse(false, null, "Token invalido");
        when(reportSendService.sendReport(any(WhatsAppSendRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/reports/send")
                .contentType(MediaType.APPLICATION_JSON)
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
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error").value("Token invalido"));
    }
}
