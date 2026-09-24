package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EstadoTerritorioPublico;
import com.predicador.reporting.service.EstadoPublicoService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportPublicControllerTest {

    @Test
    void estadoPublico_devuelveLosTerritoriosConCacheCorto() throws Exception {
        EstadoPublicoService service = mock(EstadoPublicoService.class);
        when(service.estados()).thenReturn(List.of(new EstadoTerritorioPublico(
                12, Instant.parse("2026-09-10T10:00:00Z"), null, "incomplete", 2, 6, "a,b", null)));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ReportPublicController(service)).build();

        mvc.perform(get("/api/v1/reports/public/estado"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=60, public"))
                .andExpect(jsonPath("$[0].territorio").value(12))
                .andExpect(jsonPath("$[0].manzanasIds").value("a,b"));
    }
}
