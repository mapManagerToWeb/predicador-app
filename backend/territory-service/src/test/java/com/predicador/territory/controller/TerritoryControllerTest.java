package com.predicador.territory.controller;

import com.predicador.territory.dto.TerritoryDto;
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

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class TerritoryControllerTest {

    private MockMvc mockMvc;

    @Mock
    private TerritoryService territoryService;

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
    void getAllTerritoriesGeoJson_shouldReturn200() throws Exception {
        String geoJson = "{\"type\":\"FeatureCollection\",\"features\":[]}";
        when(territoryService.getAllTerritoriesGeoJson()).thenReturn(geoJson);

        mockMvc.perform(get("/api/v1/territories/all/geojson"))
            .andExpect(status().isOk())
            .andExpect(content().string(geoJson));
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
