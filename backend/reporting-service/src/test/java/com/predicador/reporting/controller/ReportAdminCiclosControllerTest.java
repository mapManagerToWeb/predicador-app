package com.predicador.reporting.controller;

import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.service.CicloService;
import com.predicador.reporting.service.ReportAdminService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportAdminCiclosControllerTest {

    private CicloService ciclos;
    private com.predicador.reporting.service.CorreccionDeSalidas salidas;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ciclos = mock(CicloService.class);
        salidas = mock(com.predicador.reporting.service.CorreccionDeSalidas.class);
        mvc = MockMvcBuilders.standaloneSetup(new ReportAdminController(mock(ReportAdminService.class), ciclos, salidas)).build();
    }

    @Test
    void listaLosCiclos() throws Exception {
        when(ciclos.listar()).thenReturn(List.of(new CicloDto(2L, Instant.parse("2026-09-01T00:00:00Z"), null, null, null)));
        mvc.perform(get("/api/v1/reports/admin/ciclos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(2));
    }

    @Test
    void cerrarCicloPasaLaNota() throws Exception {
        when(ciclos.cerrar("fin de campaña")).thenReturn(new CicloDto(3L, Instant.now(), null, null, null));
        mvc.perform(post("/api/v1/reports/admin/ciclos/cerrar").contentType(MediaType.APPLICATION_JSON).content("{\"nota\":\"fin de campaña\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(3));
        verify(ciclos).cerrar("fin de campaña");
    }

    @Test
    void estadoDeUnTerritorioSinReportesDevuelve204() throws Exception {
        when(ciclos.estadoActual(99)).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/reports/admin/estado/99")).andExpect(status().isNoContent());
    }

    @Test
    void corregirValidaYDevuelveElId() throws Exception {
        Report r = new Report();
        r.setId(77);
        when(ciclos.corregir(any(CorreccionRequest.class))).thenReturn(r);
        mvc.perform(post("/api/v1/reports/admin/correccion").contentType(MediaType.APPLICATION_JSON).content("""
                        {"territorio":5,"manzanasIds":"5-5.a","totalManzanas":3,"manzanasMarcadas":1,"nota":"x"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(77));
        // Sin territorio: 400.
        mvc.perform(post("/api/v1/reports/admin/correccion").contentType(MediaType.APPLICATION_JSON).content("""
                        {"manzanasIds":"","totalManzanas":3,"manzanasMarcadas":0}"""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void corregirUnaSalidaDevuelveQueSeAnuloYQueSeRecalculo() throws Exception {
        when(salidas.corregir(org.mockito.ArgumentMatchers.eq(7), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new com.predicador.reporting.dto.ResultadoCorreccionSalida(7, 8, 2, false));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/reports/admin/7/corregir")
                        .contentType("application/json")
                        .content("{\"anular\":false,\"manzanasIds\":\"5-5.a\",\"nota\":\"error\"}"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.reemplazo").value(8))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.recalculados").value(2));
    }
}
