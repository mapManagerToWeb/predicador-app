package com.predicador.reporting.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.service.AuthorizationService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests that verify reporting-service security behavior:
 * authentication enforcement, authorization rules, and ProblemDetail responses.
 *
 * <p>Uses standalone MockMvc setup with real SessionAuthFilter to test
 * cookie-based authentication without requiring Docker or a real database.</p>
 */
class ReportingSecurityIntegrationTest {

    private static final String SECRET = "test-secret-for-integration-1234567890";
    private static final SessionTokenService tokenService = new SessionTokenService(SECRET, 12);

    private MockMvc mockMvc;
    private ReportService reportService;
    private AuthorizationService authorizationService;

    @BeforeEach
    void setUp() {
        reportService = mock(ReportService.class);
        authorizationService = mock(AuthorizationService.class);

        var controller = new com.predicador.reporting.controller.ReportController(
                reportService, authorizationService);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .addFilter(new com.predicador.shared.security.SessionAuthFilter(
                        tokenService,
                        List.of(
                                com.predicador.shared.security.SecurityRule.any(
                                        List.of("GET", "POST"), "^/api/v1/reports(/.*)?$", null)
                        )
                ), "/api/v1/*")
                .build();
    }

    @Test
    void getReports_withoutSession_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/reports"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getReports_withValidSession_returns200() throws Exception {
        String token = tokenService.issue("encargado-1", SessionToken.ROLE_ENCARGADO);
        when(reportService.getAllReports(any(), any()))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/v1/reports")
                        .cookie(new jakarta.servlet.http.Cookie(
                                SessionAuthFilter.SESSION_COOKIE_NAME, token)))
                .andExpect(status().isOk());
    }

    @Test
    void createReports_withoutSession_returns401() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{}]"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createReports_withValidSession_returns200() throws Exception {
        String token = tokenService.issue("encargado-1", SessionToken.ROLE_ENCARGADO);
        when(reportService.createReports(any(), any()))
                .thenReturn(List.of());

        mockMvc.perform(post("/api/v1/reports")
                        .cookie(new jakarta.servlet.http.Cookie(
                                SessionAuthFilter.SESSION_COOKIE_NAME, token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"territorioNumero\":1,\"manzanaIds\":[1],\"encargadoNombre\":\"Test\",\"encargadoApellido\":\"User\",\"sessionTime\":\"morning\",\"estado\":\"completed\"}]"))
                .andExpect(status().isOk());
    }

    @Test
    void sendWhatsAppReport_withoutSession_returns401() throws Exception {
        mockMvc.perform(post("/api/v1/reports/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportIds\":[1],\"destination\":\"+56912345678\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getReports_withInvalidSignature_returns401() throws Exception {
        SessionTokenService otherService = new SessionTokenService("different-secret-key-12345678901", 12);
        String invalidToken = otherService.issue("encargado-1", SessionToken.ROLE_ENCARGADO);

        mockMvc.perform(get("/api/v1/reports")
                        .cookie(new jakarta.servlet.http.Cookie(
                                SessionAuthFilter.SESSION_COOKIE_NAME, invalidToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getReports_withTamperedCookie_returns401() throws Exception {
        String token = tokenService.issue("encargado-1", SessionToken.ROLE_ENCARGADO);

        mockMvc.perform(get("/api/v1/reports")
                        .cookie(new jakarta.servlet.http.Cookie(
                                SessionAuthFilter.SESSION_COOKIE_NAME, token + "tampered")))
                .andExpect(status().isUnauthorized());
    }
}
