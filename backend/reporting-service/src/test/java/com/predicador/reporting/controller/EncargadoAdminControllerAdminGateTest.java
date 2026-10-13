package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoAdminDto;
import com.predicador.reporting.dto.EncargadoAdminRequest;
import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.reporting.service.EncargadoAdminService;
import com.predicador.shared.exception.GlobalExceptionHandler;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.SecurityConstants;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * H3 (complemento): cada handler de {@link EncargadoAdminController} exige rol
 * admin dentro del propio handler vía {@code AuthorizationService.requireAdmin}
 * (ADR 0016), independientemente de la expresión regular de URL del filtro.
 *
 * <p>Se invoca el controlador SIN el filtro de URL, para demostrar que el 403
 * no depende de cómo se escribió la ruta. Por cada handler se prueba: sin
 * sesión → 403 sin tocar el servicio, encargado con sesión → 403 sin tocar el
 * servicio, y admin → la operación llega al servicio.</p>
 */
class EncargadoAdminControllerAdminGateTest {

    private static final String BASE = "/api/v1/encargados/admin";

    /** Cuerpo válido de alta/edición (el {@code @Valid} se resuelve antes del handler). */
    private static final String BODY_VALIDO = """
            {"nombre":"Juan","apellido":"Perez","telefono":"+56912345678"}
            """;

    private static final EncargadoAdminDto DTO = new EncargadoAdminDto(
            1L, "Juan", "Perez", "+56912345678", 1, true, false, null, null, null, null, 0, null);

    private EncargadoAdminService service;
    private ConfiguracionService configuracion;
    private MockMvc mvc;

    /** Token admin en claro, como el que emite el login del gateway. */
    private RequestPostProcessor comoAdmin() {
        return request -> {
            request.setAttribute(SecurityConstants.ATTR_TOKEN,
                    new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L));
            return request;
        };
    }

    /** Token de encargado: sesión válida, pero no admin. */
    private RequestPostProcessor comoEncargado() {
        return request -> {
            request.setAttribute(SecurityConstants.ATTR_TOKEN,
                    new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L));
            return request;
        };
    }

    @BeforeEach
    void setUp() {
        service = mock(EncargadoAdminService.class);
        configuracion = mock(ConfiguracionService.class);
        mvc = MockMvcBuilders.standaloneSetup(
                        new EncargadoAdminController(service, configuracion, new AuthorizationService()))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // -- listar ---------------------------------------------------------------

    @Test
    void listar_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void listar_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(get(BASE).with(comoEncargado())).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void listar_conAdmin_pasa() throws Exception {
        when(service.listar()).thenReturn(List.of(DTO));
        mvc.perform(get(BASE).with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1));
        verify(service).listar();
    }

    // -- crear ----------------------------------------------------------------

    @Test
    void crear_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void crear_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE).with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void crear_conAdmin_pasa() throws Exception {
        when(service.crear(any(EncargadoAdminRequest.class))).thenReturn(DTO);
        mvc.perform(post(BASE).with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1));
        verify(service).crear(any(EncargadoAdminRequest.class));
    }

    // -- actualizar -----------------------------------------------------------

    @Test
    void actualizar_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(put(BASE + "/1").contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void actualizar_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(put(BASE + "/1").with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void actualizar_conAdmin_pasa() throws Exception {
        when(service.actualizar(eq(1L), any(EncargadoAdminRequest.class))).thenReturn(DTO);
        mvc.perform(put(BASE + "/1").with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY_VALIDO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
        verify(service).actualizar(eq(1L), any(EncargadoAdminRequest.class));
    }

    // -- eliminar -------------------------------------------------------------

    @Test
    void eliminar_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(delete(BASE + "/1")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void eliminar_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(delete(BASE + "/1").with(comoEncargado())).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void eliminar_conAdmin_pasa() throws Exception {
        mvc.perform(delete(BASE + "/1").with(comoAdmin())).andExpect(status().isNoContent());
        verify(service).eliminar(1L);
    }

    // -- generar PIN ----------------------------------------------------------

    @Test
    void generarPin_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/pin")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void generarPin_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/pin").with(comoEncargado())).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void generarPin_conAdmin_pasa() throws Exception {
        when(service.generarPin(1L)).thenReturn("123456");
        mvc.perform(post(BASE + "/1/pin").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pin").value("123456"));
        verify(service).generarPin(1L);
    }

    // -- quitar PIN -----------------------------------------------------------

    @Test
    void quitarPin_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(delete(BASE + "/1/pin")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void quitarPin_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(delete(BASE + "/1/pin").with(comoEncargado())).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void quitarPin_conAdmin_pasa() throws Exception {
        when(service.quitarPin(1L)).thenReturn(DTO);
        mvc.perform(delete(BASE + "/1/pin").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
        verify(service).quitarPin(1L);
    }

    // -- desbloquear ----------------------------------------------------------

    @Test
    void desbloquear_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/desbloquear")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void desbloquear_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/desbloquear").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void desbloquear_conAdmin_pasa() throws Exception {
        when(service.desbloquear(1L)).thenReturn(DTO);
        mvc.perform(post(BASE + "/1/desbloquear").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
        verify(service).desbloquear(1L);
    }

    // -- fusionar -------------------------------------------------------------

    @Test
    void fusionar_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/fusionar/2")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void fusionar_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mvc.perform(post(BASE + "/1/fusionar/2").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void fusionar_conAdmin_pasa() throws Exception {
        when(service.fusionar(1L, 2L)).thenReturn(DTO);
        mvc.perform(post(BASE + "/1/fusionar/2").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
        verify(service).fusionar(1L, 2L);
    }

    // -- configurar (usa ConfiguracionService, no EncargadoAdminService) ------

    @Test
    void config_sinSesion_responde403YNoTocaLaConfiguracion() throws Exception {
        mvc.perform(get(BASE + "/config")).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void config_conEncargado_responde403YNoTocaLaConfiguracion() throws Exception {
        mvc.perform(get(BASE + "/config").with(comoEncargado())).andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void config_conAdmin_pasa() throws Exception {
        when(configuracion.registroAbierto()).thenReturn(true);
        mvc.perform(get(BASE + "/config").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registroAbierto").value(true));
        verify(configuracion).registroAbierto();
    }

    @Test
    void actualizarConfig_sinSesion_responde403YNoTocaLaConfiguracion() throws Exception {
        mvc.perform(put(BASE + "/config")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"registroAbierto\":true}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void actualizarConfig_conEncargado_responde403YNoTocaLaConfiguracion() throws Exception {
        mvc.perform(put(BASE + "/config").with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"registroAbierto\":true}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, configuracion);
    }

    @Test
    void actualizarConfig_conAdmin_pasa() throws Exception {
        when(configuracion.registroAbierto()).thenReturn(true);
        mvc.perform(put(BASE + "/config").with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"registroAbierto\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registroAbierto").value(true));
        verify(configuracion).setRegistroAbierto(true);
        verify(configuracion).registroAbierto();
    }
}