package com.predicador.reporting.controller;

import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.service.ReportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class ReportControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ReportService reportService;

    @InjectMocks
    private ReportController reportController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(reportController).build();
    }

    private ReportDto createDto(Integer id, String nombre, String apellido, Long territorioNumero) {
        return new ReportDto(id, "1-A", Instant.now(), nombre, apellido, "morning", "completed", territorioNumero);
    }

    @Test
    void getAllReports_shouldReturn200() throws Exception {
        ReportDto dto1 = createDto(1, "Daniel", "Uribe", 1L);
        ReportDto dto2 = createDto(2, "Maria", "Lopez", 2L);

        when(reportService.getAllReports()).thenReturn(List.of(dto1, dto2));

        mockMvc.perform(get("/api/v1/reports"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"))
            .andExpect(jsonPath("$[1].encargadoNombre").value("Maria"));
    }

    @Test
    void getTodayReports_shouldReturn200() throws Exception {
        ReportDto dto = createDto(1, "Daniel", "Uribe", 1L);

        when(reportService.getReportsForToday()).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/reports/today"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"));
    }

    @Test
    void createReports_shouldReturn200() throws Exception {
        ReportDto saved = createDto(1, "Daniel", "Uribe", 1L);

        when(reportService.createReports(anyList())).thenReturn(List.of(saved));

        mockMvc.perform(post("/api/v1/reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content("[{\"manzanaId\":\"1-A\",\"encargadoNombre\":\"Daniel\",\"encargadoApellido\":\"Uribe\",\"sessionTime\":\"morning\",\"estado\":\"completed\",\"territorioNumero\":1}]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].encargadoNombre").value("Daniel"));
    }
}
