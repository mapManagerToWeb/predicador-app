package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.service.ReportService;
import com.predicador.reporting.service.ReportSendService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ReportControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ReportService reportService;

    @Mock
    private ReportSendService reportSendService;

    @InjectMocks
    private ReportController reportController;

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(reportController)
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler())
                .build();
    }

    private ReportDto createDto(Integer id, String nombre, String apellido, Long territorioNumero) {
        return new ReportDto(id, "1-A", Instant.now(), nombre, apellido, "morning", "completed", territorioNumero);
    }

    @Test
    void getAllReports_shouldReturn200() throws Exception {
        ReportDto dto1 = createDto(1, "Daniel", "Uribe", 1L);
        ReportDto dto2 = createDto(2, "Maria", "Lopez", 2L);

        when(reportService.getAllReports(any(), eq(admin)))
                .thenReturn(new PageImpl<>(List.of(dto1, dto2), PageRequest.of(0, 50), 2));

        mockMvc.perform(get("/api/v1/reports").requestAttr(SessionAuthFilter.ATTR_TOKEN, admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"))
            .andExpect(jsonPath("$[1].encargadoNombre").value("Maria"));
    }

    @Test
    void getTodayReports_shouldReturn200() throws Exception {
        ReportDto dto = createDto(1, "Daniel", "Uribe", 1L);

        when(reportService.getReportsForToday(any(), eq(admin)))
                .thenReturn(new PageImpl<>(List.of(dto), PageRequest.of(0, 50), 1));

        mockMvc.perform(get("/api/v1/reports/today").requestAttr(SessionAuthFilter.ATTR_TOKEN, admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"));
    }

    @Test
    void createReports_shouldReturn200() throws Exception {
        ReportDto saved = createDto(1, "Daniel", "Uribe", 1L);

        when(reportService.createReports(anyList(), any(SessionToken.class))).thenReturn(List.of(saved));

        mockMvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin)
                .content("[{\"manzanaId\":\"1-A\",\"encargadoNombre\":\"Daniel\",\"encargadoApellido\":\"Uribe\",\"sessionTime\":\"morning\",\"estado\":\"completed\",\"territorioNumero\":1}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"));
    }

    @Test
    void getReportsByAnotherOwner_shouldReturn403ProblemDetail() throws Exception {
        SessionToken owner = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        doThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "No tiene permisos"))
                .when(reportService).getReportsByEncargado(eq(8L), any(), eq(owner));

        mockMvc.perform(get("/api/v1/reports").param("encargadoId", "8")
                        .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Acceso denegado"));
    }

    @Test
    void malformedPageParameterReturnsBadRequestProblemDetail() throws Exception {
        mockMvc.perform(get("/api/v1/reports").param("page", "not-a-number")
                        .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }
}
