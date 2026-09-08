package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.service.EncargadoService;
import com.predicador.shared.security.SessionTokenService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class EncargadoControllerTest {

    private MockMvc mockMvc;

    @Mock
    private EncargadoService encargadoService;

    @Mock
    private SessionTokenService tokens;

    private EncargadoController encargadoController;

    private final SessionToken admin = new SessionToken("admin", SessionToken.ROLE_ADMIN, 1L, 2L);

    @BeforeEach
    void setUp() {
        encargadoController = new EncargadoController(encargadoService, tokens, true);
        var validator = new org.springframework.validation.beanvalidation.LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders.standaloneSetup(encargadoController)
                .setValidator(validator)
                .setControllerAdvice(new com.predicador.shared.exception.GlobalExceptionHandler(), new com.predicador.reporting.exception.GlobalExceptionHandler())
                .build();
    }

    private EncargadoDto createDto(Long id, String nombre, String apellido) {
        return new EncargadoDto(id, nombre, apellido, 1, null, true);
    }

    @Test
    void listarActivos_shouldReturn200() throws Exception {
        EncargadoDto dto1 = createDto(1L, "Daniel", "Uribe");
        EncargadoDto dto2 = createDto(2L, "Maria", "Lopez");

        when(encargadoService.listarActivos(any(), eq(admin)))
                .thenReturn(new PageImpl<>(List.of(dto1, dto2), PageRequest.of(0, 50), 2));

        mockMvc.perform(get("/api/v1/encargados").requestAttr(SessionAuthFilter.ATTR_TOKEN, admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].nombre").value("Daniel"))
            .andExpect(jsonPath("$[1].nombre").value("Maria"));
    }

    @Test
    void crear_shouldReturn200() throws Exception {
        EncargadoDto saved = createDto(1L, "Daniel", "Uribe");

        when(encargadoService.crear(any(EncargadoDto.class))).thenReturn(saved);

        mockMvc.perform(post("/api/v1/encargados")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Daniel\",\"apellido\":\"Uribe\",\"avatar\":1}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.nombre").value("Daniel"));
    }

    @Test
    void actualizar_shouldReturn200() throws Exception {
        EncargadoDto updated = createDto(1L, "Daniel", "Updated");

        when(encargadoService.actualizar(anyLong(), any(EncargadoDto.class), any(SessionToken.class)))
                .thenReturn(updated);

        mockMvc.perform(put("/api/v1/encargados/1")
                .contentType(MediaType.APPLICATION_JSON)
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin)
                .content("{\"nombre\":\"Daniel\",\"apellido\":\"Updated\",\"avatar\":1}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.apellido").value("Updated"));
    }

    @Test
    void buscar_shouldReturn200() throws Exception {
        EncargadoDto dto = createDto(1L, "Daniel", "Uribe");

        when(encargadoService.buscarPorNombre(anyString(), any(), any(SessionToken.class)))
                .thenReturn(new PageImpl<>(List.of(dto), PageRequest.of(0, 50), 1));

        mockMvc.perform(get("/api/v1/encargados/buscar").param("nombre", "Daniel")
                .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].nombre").value("Daniel"));
    }

    @Test
    void buscarOCrear_shouldReturn200_conCookieCuandoConfigurado() throws Exception {
        EncargadoDto dto = createDto(1L, "Daniel", "Uribe");

        when(encargadoService.buscarOCrear(anyString(), anyString(), any()))
                .thenReturn(Optional.of(dto));
        when(tokens.isConfigured()).thenReturn(true);
        when(tokens.issue(anyString(), anyString())).thenReturn("fake.token");

        var result = mockMvc.perform(post("/api/v1/encargados/buscar-crear")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Daniel\",\"apellido\":\"Uribe\",\"telefono\":\"56912345678\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.encargado.nombre").value("Daniel"))
            .andExpect(jsonPath("$.token").doesNotExist())
            .andReturn();

        java.util.List<String> setCookieHeaders = result.getResponse().getHeaders("Set-Cookie");
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders)
                .anyMatch(c -> c.contains("predicador_session=") && c.contains("HttpOnly") && c.contains("Secure") && c.contains("SameSite=Lax"));
    }

    @Test
    void login_shouldReturn200_conEnvoltorioLoginResponse() throws Exception {
        EncargadoDto dto = createDto(7L, "Ana", "Perez");

        when(encargadoService.buscarPorTelefono(anyString())).thenReturn(Optional.of(dto));
        when(tokens.isConfigured()).thenReturn(true);
        when(tokens.issue(anyString(), anyString())).thenReturn("fake.token");

        var result = mockMvc.perform(post("/api/v1/encargados/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"telefono\":\"+54911111111\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.encargado.id").value(7))
            .andExpect(jsonPath("$.encargado.nombre").value("Ana"))
            .andExpect(jsonPath("$.token").doesNotExist())
            .andReturn();

        java.util.List<String> setCookieHeaders = result.getResponse().getHeaders("Set-Cookie");
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders)
                .anyMatch(c -> c.contains("predicador_session=") && c.contains("HttpOnly") && c.contains("Secure") && c.contains("SameSite=Lax"));
    }

    @Test
    void login_doesNotEmitCsrfCookie() throws Exception {
        EncargadoDto dto = createDto(7L, "Ana", "Perez");

        when(encargadoService.buscarPorTelefono(anyString())).thenReturn(Optional.of(dto));
        when(tokens.isConfigured()).thenReturn(true);
        when(tokens.issue(anyString(), anyString())).thenReturn("fake.token");

        var result = mockMvc.perform(post("/api/v1/encargados/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"telefono\":\"+54911111111\"}"))
            .andExpect(status().isOk())
            .andReturn();

        // El token CSRF es responsabilidad del gateway (CsrfProtectionFilter):
        // un servicio detrás del edge que también lo emita deja al navegador
        // con dos valores distintos y rompe el double-submit.
        java.util.List<String> setCookieHeaders = result.getResponse().getHeaders("Set-Cookie");
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(setCookieHeaders.get(0))
                .contains("predicador_session=").contains("HttpOnly").contains("SameSite=Lax")
                .doesNotContain("XSRF-TOKEN");
    }

    @Test
    void login_shouldReturn404_siNoExiste() throws Exception {
        when(encargadoService.buscarPorTelefono(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/encargados/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"telefono\":\"+54900000000\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void actualizarOtroOwner_shouldReturn403ProblemDetail() throws Exception {
        SessionToken owner = new SessionToken("7", SessionToken.ROLE_ENCARGADO, 1L, 2L);
        doThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "No tiene permisos"))
                .when(encargadoService).actualizar(eq(8L), any(EncargadoDto.class), eq(owner));

        mockMvc.perform(put("/api/v1/encargados/8")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nombre\":\"Daniel\",\"apellido\":\"Updated\",\"avatar\":1}")
                        .requestAttr(SessionAuthFilter.ATTR_TOKEN, owner))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Acceso denegado"));
    }

    @Test
    void login_emptyBody_returns400() throws Exception {
        mockMvc.perform(post("/api/v1/encargados/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void localHttpOverride_omitsSecureAttribute() throws Exception {
        EncargadoController localController = new EncargadoController(encargadoService, tokens, false);
        EncargadoDto dto = createDto(7L, "Ana", "Perez");
        when(encargadoService.buscarPorTelefono(anyString())).thenReturn(Optional.of(dto));
        when(tokens.isConfigured()).thenReturn(true);
        when(tokens.issue(anyString(), anyString())).thenReturn("fake.token");

        MockMvcBuilders.standaloneSetup(localController).build()
                .perform(post("/api/v1/encargados/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"telefono\":\"+54911111111\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("Secure"))));
    }
}
