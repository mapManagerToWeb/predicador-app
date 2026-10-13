package com.predicador.reporting.controller;

import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.service.CicloService;
import com.predicador.reporting.service.ReportAdminService;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportAdminCiclosControllerTest {

    private ReportAdminService service;
    private CicloService ciclos;
    private com.predicador.reporting.service.CorreccionDeSalidas salidas;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(ReportAdminService.class);
        ciclos = mock(CicloService.class);
        salidas = mock(com.predicador.reporting.service.CorreccionDeSalidas.class);
        mvc = MockMvcBuilders.standaloneSetup(new ReportAdminController(
                service, ciclos, salidas, new AuthorizationService()))
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler())
                .build();
    }

    /** Token admin en claro, como el que emite el login del gateway. */
    private static RequestPostProcessor comoAdmin() {
        return request -> {
            request.setAttribute(SecurityConstants.ATTR_TOKEN,
                    new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L));
            return request;
        };
    }

    /** Token de encargado: sesión válida, pero no admin. */
    private static RequestPostProcessor comoEncargado() {
        return request -> {
            request.setAttribute(SecurityConstants.ATTR_TOKEN,
                    new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L));
            return request;
        };
    }

    @Test
    void listaLosCiclos() throws Exception {
        when(ciclos.listar()).thenReturn(List.of(new CicloDto(2L, Instant.parse("2026-09-01T00:00:00Z"), null, null, null)));
        mvc.perform(get("/api/v1/reports/admin/ciclos").with(comoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(2));
    }

    @Test
    void cerrarCicloPasaLaNota() throws Exception {
        when(ciclos.cerrar("fin de campaña")).thenReturn(new CicloDto(3L, Instant.now(), null, null, null));
        mvc.perform(post("/api/v1/reports/admin/ciclos/cerrar").with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nota\":\"fin de campaña\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(3));
        verify(ciclos).cerrar("fin de campaña");
    }

    @Test
    void estadoDeUnTerritorioSinReportesDevuelve204() throws Exception {
        when(ciclos.estadoActual(99)).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/reports/admin/estado/99").with(comoAdmin()))
                .andExpect(status().isNoContent());
    }

    @Test
    void corregirValidaYDevuelveElId() throws Exception {
        Report r = new Report();
        r.setId(77);
        when(ciclos.corregir(any(CorreccionRequest.class))).thenReturn(r);
        mvc.perform(post("/api/v1/reports/admin/correccion").with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"territorio":5,"manzanasIds":"5-5.a","totalManzanas":3,"manzanasMarcadas":1,"nota":"x"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(77));
        // Sin territorio: 400.
        mvc.perform(post("/api/v1/reports/admin/correccion").with(comoAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"manzanasIds":"","totalManzanas":3,"manzanasMarcadas":0}"""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void corregirUnaSalidaDevuelveQueSeAnuloYQueSeRecalculo() throws Exception {
        when(salidas.corregir(org.mockito.ArgumentMatchers.eq(7), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new com.predicador.reporting.dto.ResultadoCorreccionSalida(7, 8, 2, false));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/reports/admin/7/corregir")
                        .with(comoAdmin())
                        .contentType("application/json")
                        .content("{\"anular\":false,\"manzanasIds\":\"5-5.a\",\"nota\":\"error\"}"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.reemplazo").value(8))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.recalculados").value(2));
    }

    // -- H3: el panel exige rol admin en el handler, no solo por la URL -------

    @Test
    void sinSesionNoEntraAlPanel() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/ciclos"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    @Test
    void unEncargadoNoEntraAlPanel() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/ciclos").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    @Test
    void unEncargadoNoPuedeCerrarElCiclo() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/ciclos/cerrar").with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nota\":\"x\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    // -- listar GET / ---------------------------------------------------------

    @Test
    void sinSesionNoListaReportes() throws Exception {
        mvc.perform(get("/api/v1/reports/admin"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void unEncargadoNoListaReportes() throws Exception {
        mvc.perform(get("/api/v1/reports/admin").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    // -- eliminar DELETE /?ids= -----------------------------------------------

    @Test
    void sinSesionNoEliminaReportes() throws Exception {
        mvc.perform(delete("/api/v1/reports/admin").param("ids", "1,2"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void unEncargadoNoEliminaReportes() throws Exception {
        mvc.perform(delete("/api/v1/reports/admin").param("ids", "1,2").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    // -- envios GET /whatsapp -------------------------------------------------

    @Test
    void sinSesionNoVeLosEnviosWhatsApp() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/whatsapp"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void unEncargadoNoVeLosEnviosWhatsApp() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/whatsapp").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    // -- estado GET /estado/{territorio} --------------------------------------

    @Test
    void sinSesionNoVeElEstadoDeUnTerritorio() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/estado/5"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    @Test
    void unEncargadoNoVeElEstadoDeUnTerritorio() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/estado/5").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    // -- salida GET /{id}/salida ----------------------------------------------

    @Test
    void sinSesionNoVeLaSalida() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/7/salida"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(salidas);
    }

    @Test
    void unEncargadoNoVeLaSalida() throws Exception {
        mvc.perform(get("/api/v1/reports/admin/7/salida").with(comoEncargado()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(salidas);
    }

    // -- corregirSalida POST /{id}/corregir -----------------------------------

    @Test
    void sinSesionNoCorrigeUnaSalida() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/7/corregir")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"anular\":false,\"manzanasIds\":\"5-5.a\",\"nota\":\"error\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(salidas);
    }

    @Test
    void unEncargadoNoCorrigeUnaSalida() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/7/corregir").with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"anular\":false,\"manzanasIds\":\"5-5.a\",\"nota\":\"error\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(salidas);
    }

    // -- corregir POST /correccion --------------------------------------------

    @Test
    void sinSesionNoCorrigeElEstadoDeUnTerritorio() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/correccion")
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"territorio":5,"manzanasIds":"5-5.a","totalManzanas":3,"manzanasMarcadas":1,"nota":"x"}"""))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }

    @Test
    void unEncargadoNoCorrigeElEstadoDeUnTerritorio() throws Exception {
        mvc.perform(post("/api/v1/reports/admin/correccion").with(comoEncargado())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"territorio":5,"manzanasIds":"5-5.a","totalManzanas":3,"manzanasMarcadas":1,"nota":"x"}"""))
                .andExpect(status().isForbidden());
        verifyNoInteractions(ciclos);
    }
}
