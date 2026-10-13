package com.predicador.territory.controller;

import com.predicador.shared.exception.GlobalExceptionHandler;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.territory.service.ManzanaAdminService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * H3: los handlers de administracion no tenian control de autorizacion en la
 * capa de servicio. El unico filtro era la expresion regular de URL de
 * {@code SessionAuthFilter}, que se puede esquivar escribiendo la misma ruta de
 * otra forma ({@code %61dmin}, {@code //}, {@code /./}) — la regresion de eso
 * vive en {@code SessionAuthFilterTest}.
 *
 * <p>Estas pruebas fijan la segunda capa: cada handler rechaza con 403 a quien
 * no sea admin <em>antes</em> de tocar el servicio. Se invoca el controlador
 * SIN el filtro de URL, precisamente para demostrar que la comprobacion no
 * depende de como se escribio la URL. Si {@code requireAdmin} faltara en un
 * handler, el 403 no apareceria.</p>
 */
class TerritoryAdminControllerAdminGateTest {

    private static final String SECRET = "test-secret-for-admin-gate-1234567890";

    /** Atributo que el filtro deja con el token validado. */
    private static final String ATTR = SessionAuthFilter.ATTR_TOKEN;

    /** Cuerpo valido de manzana: {@code geometria} es texto GeoJSON. */
    private static final String MANZANA_JSON = """
            {"territorio":1,"nombre":"Manzana 1",\
            "geometria":"{\\"type\\":\\"Polygon\\",\\"coordinates\\":[[[0,0],[0,1],[1,1],[0,0]]]}"}
            """;

    private final SessionTokenService tokenService = new SessionTokenService(SECRET, 12);
    private final AuthorizationService authorization = new AuthorizationService(tokenService);

    private ManzanaAdminService service;
    private MockMvc mockMvc;

    private SessionToken adminToken;
    private SessionToken encargadoToken;

    @BeforeEach
    void setUp() {
        service = mock(ManzanaAdminService.class);
        adminToken = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);
        encargadoToken = new SessionToken("42", SessionToken.ROLE_ENCARGADO, 1L, 2L);

        when(service.listarGeoJson()).thenReturn("{\"type\":\"FeatureCollection\",\"features\":[]}");

        // El advice es el de `shared`: en un `@SpringBootTest` no hace falta
        // declararlo, pero en standalone hay que registrarlo a mano o
        // `ForbiddenOperationException` sale como error de servlet y no como 403.
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new TerritoryAdminController(service, authorization))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // -- listado -------------------------------------------------------------

    @Test
    void listar_sinSesion_responde403YNoLlamaAlServicio() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/manzanas"))
                .andExpect(status().isForbidden());

        verify(service, never()).listarGeoJson();
    }

    @Test
    void listar_conEncargado_responde403YNoLlamaAlServicio() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/manzanas").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).listarGeoJson();
    }

    @Test
    void listar_conAdmin_pasa() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/manzanas").requestAttr(ATTR, adminToken))
                .andExpect(status().isOk());

        verify(service).listarGeoJson();
    }

    // -- una manzana: obtener, crear, actualizar, eliminar, reparar ------------

    @Test
    void obtener_sinAdmin_responde403() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/manzanas/7").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).obtener(anyLong());
    }

    @Test
    void obtener_conAdmin_pasa() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/manzanas/7")
                        .requestAttr(ATTR, adminToken))
                .andExpect(status().isOk());

        verify(service).obtener(7L);
    }

    @Test
    void crear_sinAdmin_responde403() throws Exception {
        mockMvc.perform(post("/api/v1/territories/admin/manzanas")
                        .requestAttr(ATTR, encargadoToken)
                        .contentType("application/json")
                        .content(MANZANA_JSON))
                .andExpect(status().isForbidden());

        verify(service, never()).crear(any());
    }

    @Test
    void actualizar_sinAdmin_responde403() throws Exception {
        mockMvc.perform(put("/api/v1/territories/admin/manzanas/7")
                        .requestAttr(ATTR, encargadoToken)
                        .contentType("application/json")
                        .content(MANZANA_JSON))
                .andExpect(status().isForbidden());

        verify(service, never()).actualizar(anyLong(), any());
    }

    @Test
    void eliminar_sinAdmin_responde403() throws Exception {
        mockMvc.perform(delete("/api/v1/territories/admin/manzanas/7").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).eliminar(anyLong());
    }

    @Test
    void eliminar_conAdmin_pasa() throws Exception {
        mockMvc.perform(delete("/api/v1/territories/admin/manzanas/7").requestAttr(ATTR, adminToken))
                .andExpect(status().isNoContent());

        verify(service).eliminar(7L);
    }

    @Test
    void reparar_sinAdmin_responde403() throws Exception {
        mockMvc.perform(post("/api/v1/territories/admin/manzanas/7/reparar").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).reparar(anyLong());
    }

    // -- operaciones de conjunto --------------------------------------------

    @Test
    void reasignar_sinAdmin_responde403() throws Exception {
        mockMvc.perform(post("/api/v1/territories/admin/manzanas/reasignar")
                        .requestAttr(ATTR, encargadoToken)
                        .contentType("application/json")
                        .content("{\"ids\":[1,2],\"territorio\":3}"))
                .andExpect(status().isForbidden());

        verify(service, never()).reasignar(anyList(), any());
    }

    @Test
    void reasignar_conAdmin_pasa() throws Exception {
        when(service.reasignar(anyList(), anyLong())).thenReturn(2);

        mockMvc.perform(post("/api/v1/territories/admin/manzanas/reasignar")
                        .requestAttr(ATTR, adminToken)
                        .contentType("application/json")
                        .content("{\"ids\":[1,2],\"territorio\":3}"))
                .andExpect(status().isOk());

        verify(service).reasignar(java.util.List.of(1L, 2L), 3L);
    }

    @Test
    void eliminarTerritorio_sinAdmin_responde403() throws Exception {
        mockMvc.perform(delete("/api/v1/territories/admin/territorios/4").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).eliminarTerritorio(anyLong());
    }

    @Test
    void eliminarTerritorio_conAdmin_pasa() throws Exception {
        when(service.eliminarTerritorio(anyLong())).thenReturn(2);

        mockMvc.perform(delete("/api/v1/territories/admin/territorios/4").requestAttr(ATTR, adminToken))
                .andExpect(status().isOk());

        verify(service).eliminarTerritorio(4L);
    }

    // -- importar y calidad --------------------------------------------------

    @Test
    void importar_sinAdmin_responde403() throws Exception {
        mockMvc.perform(post("/api/v1/territories/admin/importar")
                        .requestAttr(ATTR, encargadoToken)
                        .contentType("application/json")
                        .content("{\"type\":\"FeatureCollection\",\"features\":[]}"))
                .andExpect(status().isForbidden());

        verify(service, never()).importar(any());
    }

    @Test
    void calidad_sinAdmin_responde403() throws Exception {
        mockMvc.perform(get("/api/v1/territories/admin/calidad").requestAttr(ATTR, encargadoToken))
                .andExpect(status().isForbidden());

        verify(service, never()).calidad();
    }

    @Test
    void calidad_conAdmin_pasa() throws Exception {
        when(service.calidad()).thenReturn(Map.<String, Object>of("total", 3));

        mockMvc.perform(get("/api/v1/territories/admin/calidad").requestAttr(ATTR, adminToken))
                .andExpect(status().isOk());

        verify(service).calidad();
    }
}