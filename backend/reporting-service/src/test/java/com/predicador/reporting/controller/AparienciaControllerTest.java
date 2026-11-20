package com.predicador.reporting.controller;

import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AparienciaControllerTest {

    private ConfiguracionService configuracion;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        configuracion = mock(ConfiguracionService.class);
        mvc = MockMvcBuilders.standaloneSetup(new AparienciaController(configuracion, new AuthorizationService()))
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
    void cualquieraLeeLaIntensidad() throws Exception {
        when(configuracion.opacidadPredicadas()).thenReturn(0.7);
        mvc.perform(get("/api/v1/reports/public/apariencia"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.opacidadPredicadas").value(0.7));
    }

    @Test
    void elAdministradorLaCambia() throws Exception {
        when(configuracion.setOpacidadPredicadas(0.8)).thenReturn(0.8);
        mvc.perform(put("/api/v1/reports/admin/apariencia").with(como("admin", SessionToken.ROLE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"opacidadPredicadas\":0.8}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.opacidadPredicadas").value(0.8));
    }

    @Test
    void sinValor_esUnError() throws Exception {
        mvc.perform(put("/api/v1/reports/admin/apariencia").with(como("admin", SessionToken.ROLE_ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verify(configuracion, never()).setOpacidadPredicadas(anyDouble());
    }

    @Test
    void unEncargadoNoLaPuedeCambiar() throws Exception {
        mvc.perform(put("/api/v1/reports/admin/apariencia").with(como("7", SessionToken.ROLE_ENCARGADO))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"opacidadPredicadas\":0.9}"))
                .andExpect(status().isForbidden());
        verify(configuracion, never()).setOpacidadPredicadas(anyDouble());
    }
}
