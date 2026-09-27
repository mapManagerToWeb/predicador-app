package com.predicador.territory.controller;

import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.dto.TerritoryMetadataDto;
import com.predicador.territory.service.TerritoryMetadataService;
import com.predicador.territory.service.TerritoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class TerritoryControllerTest {

    private MockMvc mockMvc;

    @Mock
    private TerritoryService territoryService;

    @Mock
    private TerritoryMetadataService territoryMetadataService;

    @InjectMocks
    private TerritoryController territoryController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(territoryController).build();
    }

    @Test
    void getTerritoryNumbers_shouldReturn200() throws Exception {
        when(territoryService.getTerritoryNumbers()).thenReturn(List.of(1L, 2L, 3L));

        mockMvc.perform(get("/api/v1/territories"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0]").value(1))
            .andExpect(jsonPath("$[1]").value(2))
            .andExpect(jsonPath("$[2]").value(3));
    }

    @Test
    void getAllTerritoriesGeoJson_endpointRemoved_returns404WithoutTerritoryData() throws Exception {
        // Spec (geojson-api): el snapshot bulk ya no existe — la petición
        // SHALL devolver 404 sin datos de territorios. Restricción \d+ en
        // /{number}/geojson evita que "all" caiga en la conversión a Long.
        mockMvc.perform(get("/api/v1/territories/all/geojson"))
            .andExpect(status().isNotFound())
            .andExpect(content().string(not(containsString("FeatureCollection"))))
            .andExpect(content().string(not(containsString("features"))));

        verifyNoInteractions(territoryService);
    }

    @Test
    void getAllColors_shouldReturn200() throws Exception {
        when(territoryService.getAllColors()).thenReturn(Map.of(1L, "#ff0000", 2L, "#3cb44b"));

        mockMvc.perform(get("/api/v1/territories/colors"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.1").value("#ff0000"))
            .andExpect(jsonPath("$.2").value("#3cb44b"));
    }

    @Test
    void getTerritoryGeoJson_shouldReturn200() throws Exception {
        String geoJson = "{\"type\":\"FeatureCollection\",\"features\":[]}";
        when(territoryService.getTerritoryGeoJson(1L)).thenReturn(geoJson);

        mockMvc.perform(get("/api/v1/territories/1/geojson"))
            .andExpect(status().isOk())
            .andExpect(content().string(geoJson));
    }

    @Test
    void assignColor_shouldReturn200() throws Exception {
        mockMvc.perform(put("/api/v1/territories/1/color")
                .contentType("application/json")
                .content("{\"color\":\"#ff0000\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void getTerritoriesMetadata_shouldReturnDtoFieldsWithoutGeometry() throws Exception {
        TerritoryMetadataDto dto = new TerritoryMetadataDto(7L, "Territorio 7", "#ff0000",
            List.of(-71.0, -33.1, -70.9, -33.0), List.of(-70.95, -33.05), 3L,
            List.of(7100L, 7101L, 7102L));
        when(territoryMetadataService.getMetadata()).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/territories/metadata"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].numero").value(7))
            .andExpect(jsonPath("$[0].nombre").value("Territorio 7"))
            .andExpect(jsonPath("$[0].color").value("#ff0000"))
            .andExpect(jsonPath("$[0].bounds[0]").value(-71.0))
            .andExpect(jsonPath("$[0].bounds[3]").value(-33.0))
            .andExpect(jsonPath("$[0].center[0]").value(-70.95))
            .andExpect(jsonPath("$[0].center[1]").value(-33.05))
            .andExpect(jsonPath("$[0].manzanaCount").value(3))
            .andExpect(jsonPath("$[0].fids[0]").value(7100))
            .andExpect(jsonPath("$[0].fids[2]").value(7102))
            .andExpect(content().string(not(containsString("geometry"))))
            .andExpect(content().string(not(containsString("coordinates"))));
    }

    @Test
    void getTerritoriesMetadata_shouldReturnEmptyArrayWhenNoTerritories() throws Exception {
        when(territoryMetadataService.getMetadata()).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/territories/metadata"))
            .andExpect(status().isOk())
            .andExpect(content().string("[]"));
    }

    @Test
    void getTerritory_shouldReturn200() throws Exception {
        TerritoryDto dto = new TerritoryDto(1L, "Territorio 1", "{\"type\":\"FeatureCollection\",\"features\":[]}", "#ff0000");
        when(territoryService.getTerritory(1L)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/territories/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.number").value(1))
            .andExpect(jsonPath("$.name").value("Territorio 1"))
            .andExpect(jsonPath("$.color").value("#ff0000"));
    }
}
