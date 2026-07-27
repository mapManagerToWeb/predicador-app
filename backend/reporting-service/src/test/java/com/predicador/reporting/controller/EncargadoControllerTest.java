package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.service.EncargadoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class EncargadoControllerTest {

    private MockMvc mockMvc;

    @Mock
    private EncargadoService encargadoService;

    @InjectMocks
    private EncargadoController encargadoController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(encargadoController).build();
    }

    private EncargadoDto createDto(Long id, String nombre, String apellido) {
        return new EncargadoDto(id, nombre, apellido, 1, null, true);
    }

    @Test
    void listarActivos_shouldReturn200() throws Exception {
        EncargadoDto dto1 = createDto(1L, "Daniel", "Uribe");
        EncargadoDto dto2 = createDto(2L, "Maria", "Lopez");

        when(encargadoService.listarActivos()).thenReturn(List.of(dto1, dto2));

        mockMvc.perform(get("/api/v1/encargados"))
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

        when(encargadoService.actualizar(anyLong(), any(EncargadoDto.class))).thenReturn(updated);

        mockMvc.perform(put("/api/v1/encargados/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Daniel\",\"apellido\":\"Updated\",\"avatar\":1}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.apellido").value("Updated"));
    }

    @Test
    void buscar_shouldReturn200() throws Exception {
        EncargadoDto dto = createDto(1L, "Daniel", "Uribe");

        when(encargadoService.buscarPorNombre(anyString())).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/encargados/buscar").param("nombre", "Daniel"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].nombre").value("Daniel"));
    }

    @Test
    void buscarOCrear_shouldReturn200() throws Exception {
        EncargadoDto dto = createDto(1L, "Daniel", "Uribe");

        when(encargadoService.buscarOCrear(anyString(), anyString(), any()))
                .thenReturn(Optional.of(dto));

        mockMvc.perform(post("/api/v1/encargados/buscar-crear")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Daniel\",\"apellido\":\"Uribe\",\"telefono\":\"56912345678\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nombre").value("Daniel"));
    }
}
