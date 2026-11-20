package com.predicador.reporting.controller;

import com.predicador.reporting.service.CapacitacionService;
import com.predicador.reporting.service.ConfiguracionService.Capacitacion;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CapacitacionControllerTest {

    private CapacitacionService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(CapacitacionService.class);
        mvc = MockMvcBuilders.standaloneSetup(new CapacitacionController(service, new AuthorizationService()))
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler())
                .build();
    }

    private static RequestPostProcessor como(String sujeto, String rol) {
        return request -> {
            request.setAttribute(SecurityConstants.ATTR_TOKEN, new SessionToken(sujeto, rol, 1L, 2L));
            return request;
        };
    }

    @Test
    void elAvisoPublico_diceSiHayUnaYDesdeCuandoSinSesion() throws Exception {
        when(service.enCurso()).thenReturn(Optional.of(new Capacitacion(Instant.parse("2026-11-22T19:00:00Z"), 120L)));
        mvc.perform(get("/api/v1/reports/public/capacitacion"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.activa").value(true))
                .andExpect(jsonPath("$.desde").value("2026-11-22T19:00:00Z"))
                .andExpect(jsonPath("$.ultimoReporte").doesNotExist());

        when(service.enCurso()).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/reports/public/capacitacion"))
                .andExpect(jsonPath("$.activa").value(false))
                .andExpect(jsonPath("$.desde").doesNotExist());
    }

    @Test
    void elAdministradorVeLasPruebas_empiezaYTermina() throws Exception {
        var prueba = new CapacitacionService.Prueba(121, Instant.parse("2026-11-22T19:10:00Z"), 15L, "Juan Pérez", "incomplete", "salida");
        var estado = new CapacitacionService.Estado(true, Instant.parse("2026-11-22T19:00:00Z"), List.of(prueba));
        when(service.estado()).thenReturn(estado);
        when(service.empezar()).thenReturn(estado);
        when(service.terminar(true)).thenReturn(1);

        mvc.perform(get("/api/v1/reports/admin/capacitacion").with(como("admin", SessionToken.ROLE_ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pruebas[0].territorio").value(15))
                .andExpect(jsonPath("$.pruebas[0].encargado").value("Juan Pérez"));
        mvc.perform(post("/api/v1/reports/admin/capacitacion/empezar").with(como("admin", SessionToken.ROLE_ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activa").value(true));
        mvc.perform(post("/api/v1/reports/admin/capacitacion/terminar").with(como("admin", SessionToken.ROLE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"borrar\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.borrados").value(1));
    }

    @Test
    void terminarSinCuerpo_noBorraNada() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/capacitacion/terminar").with(como("admin", SessionToken.ROLE_ADMIN)))
                .andExpect(status().isOk());
        verify(service).terminar(false);
    }

    @Test
    void unEncargadoNoPuedeManejarLaCapacitacion() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/capacitacion/empezar").with(como("7", SessionToken.ROLE_ENCARGADO)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/reports/admin/capacitacion/terminar").with(como("7", SessionToken.ROLE_ENCARGADO))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"borrar\":true}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/reports/admin/capacitacion").with(como("7", SessionToken.ROLE_ENCARGADO)))
                .andExpect(status().isForbidden());
        verify(service, never()).empezar();
        verify(service, never()).terminar(anyBoolean());
    }
}
