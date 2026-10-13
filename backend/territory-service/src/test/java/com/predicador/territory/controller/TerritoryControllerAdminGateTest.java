package com.predicador.territory.controller;

import com.predicador.shared.exception.GlobalExceptionHandler;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.territory.service.TerritoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * H3 (hueco restante): {@code PUT /api/v1/territories/{n}/color} era el unico
 * handler con escritura que dependia SOLO de la expresion regular de
 * {@code SessionAuthFilter}. Esa es exactamente la clase de defecto que H3
 * exists para eliminar: una comprobacion que depende de como se escribio la
 * URL.
 *
 * <p>Estas pruebas fijan la segunda capa. Se dispara el controlador SIN el
 * filtro de URL, precisamente para demostrar que el 403 no viene de ahi: si
 * {@code requireAdmin} faltara en el handler, estas pruebas NO darian 403.</p>
 */
class TerritoryControllerAdminGateTest {

    private static final String SECRET = "test-secret-for-color-gate-1234567890";

    private static final String ATTR = SessionAuthFilter.ATTR_TOKEN;

    private static final String COLOR_JSON = "{\"color\":\"#ff0000\"}";

    private final SessionTokenService tokenService = new SessionTokenService(SECRET, 12);
    private final AuthorizationService authorization = new AuthorizationService(tokenService);

    private TerritoryService service;
    private MockMvc mockMvc;

    private SessionToken adminToken;
    private SessionToken encargadoToken;

    @BeforeEach
    void setUp() {
        service = mock(TerritoryService.class);
        adminToken = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
        encargadoToken = new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L);

        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TerritoryController(service, authorization))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void assignColor_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mockMvc.perform(put("/api/v1/territories/1/color")
                        .contentType("application/json")
                        .content(COLOR_JSON))
            .andExpect(status().isForbidden());

        verify(service, never()).assignColor(anyLong(), anyString());
    }

    @Test
    void assignColor_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mockMvc.perform(put("/api/v1/territories/1/color")
                        .contentType("application/json")
                        .requestAttr(ATTR, encargadoToken)
                        .content(COLOR_JSON))
            .andExpect(status().isForbidden());

        verify(service, never()).assignColor(anyLong(), anyString());
    }

    @Test
    void assignColor_conAdmin_pasa() throws Exception {
        mockMvc.perform(put("/api/v1/territories/1/color")
                        .contentType("application/json")
                        .requestAttr(ATTR, adminToken)
                        .content(COLOR_JSON))
            .andExpect(status().isOk());

        verify(service).assignColor(1L, "#ff0000");
    }

    /**
     * El orden importa: la autorizacion es la PRIMERA sentencia del handler.
     * Un cuerpo invalido no puede ser la razon del 403, asi que se afirma que
     * el servicio nunca se toca por mucho que la peticion fuera valida en lo
     * demas. Cubre tambien el caso de que alguien moviera la comprobacion
     * despues de deserializar: el servicio seguiria sin recibir la llamada.
     */
    @Test
    void assignColor_rechazaAntesDeTocarElServicioAunqueElBodySeaValido() throws Exception {
        mockMvc.perform(put("/api/v1/territories/99/color")
                        .contentType("application/json")
                        .requestAttr(ATTR, encargadoToken)
                        .content(COLOR_JSON))
            .andExpect(status().isForbidden());

        verify(service, never()).assignColor(anyLong(), anyString());
    }
}