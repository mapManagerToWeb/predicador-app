package com.predicador.territory.service;

import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.geojson.HibernateSpatialTerritoryGeoJsonSerializer;
import com.predicador.territory.geojson.TerritoryGeoJsonSerializer;
import com.predicador.territory.model.TerritoryColor;
import com.predicador.territory.repository.TerritoryColorRepository;
import com.predicador.territory.repository.TerritoryRepository;
import com.predicador.territory.repository.TerritoryRepository.ManzanaGeoJsonProjection;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TerritoryServiceTest {

    @Mock
    private TerritoryRepository territoryRepository;

    @Mock
    private TerritoryColorRepository colorRepository;

    private TerritoryGeoJsonSerializer geoJsonSerializer;
    private TerritoryService territoryService;

    @BeforeEach
    void setUp() {
        geoJsonSerializer = new HibernateSpatialTerritoryGeoJsonSerializer();
        territoryService = new TerritoryService(territoryRepository, colorRepository, geoJsonSerializer, new SimpleMeterRegistry());
    }

    private ManzanaGeoJsonProjection projection(Long territorioPadre, String nombreBloque, String geoJson) {
        return new ManzanaGeoJsonProjection() {
            @Override
            public Long getTerritorioPadre() {
                return territorioPadre;
            }

            @Override
            public String getNombreBloque() {
                return nombreBloque;
            }

            @Override
            public String getGeoJson() {
                return geoJson;
            }
        };
    }

    private String simplePolygonGeojson() {
        return "{\"type\":\"Polygon\",\"coordinates\":[[[-73.4,-37.4],[-73.4,-37.5],[-73.5,-37.5],[-73.5,-37.4],[-73.4,-37.4]]]}";
    }

    @Test
    void getTerritoryNumbers_shouldReturnDistinctNumbers() {
        when(territoryRepository.findDistinctTerritorioPadres()).thenReturn(List.of(1L, 2L, 3L));

        List<Long> result = territoryService.getTerritoryNumbers();

        assertEquals(List.of(1L, 2L, 3L), result);
        verify(territoryRepository).findDistinctTerritorioPadres();
    }

    @Test
    void getTerritory_shouldReturnDto() {
        ManzanaGeoJsonProjection m = projection(1L, "1.a", simplePolygonGeojson());
        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m));
        when(colorRepository.findById(1L)).thenReturn(Optional.of(new TerritoryColor()));

        TerritoryDto result = territoryService.getTerritory(1L);

        assertNotNull(result);
        assertEquals(1L, result.number());
        assertEquals("Territorio 1", result.name());
        assertNotNull(result.geoJson());
        assertTrue(result.geoJson().contains("FeatureCollection"));
    }

    @Test
    void getTerritory_shouldThrowWhenNotFound() {
        when(territoryRepository.findGeoJsonByTerritorioPadre(99L)).thenReturn(List.of());

        assertThrows(RuntimeException.class, () -> territoryService.getTerritory(99L));
    }

    @Test
    void getTerritoryGeoJson_shouldReturnGeoJson() {
        ManzanaGeoJsonProjection m = projection(1L, "1.a", simplePolygonGeojson());
        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertNotNull(result);
        assertTrue(result.contains("FeatureCollection"));
        assertTrue(result.contains("Feature"));
        assertTrue(result.contains("Polygon"));
        assertTrue(result.contains("1.a"));
    }

    @Test
    void getAllTerritoriesGeoJson_shouldReturnAllFeatures() {
        ManzanaGeoJsonProjection m1 = projection(1L, "1.a", simplePolygonGeojson());
        ManzanaGeoJsonProjection m2 = projection(2L, "2.a", simplePolygonGeojson());

        when(territoryRepository.findAllGeoJsonGroupedByTerritorio()).thenReturn(List.of(m1, m2));
        when(territoryRepository.findDistinctTerritorioPadres()).thenReturn(List.of(1L, 2L));
        when(colorRepository.findAll()).thenReturn(List.of());

        String result = territoryService.getAllTerritoriesGeoJson();

        assertNotNull(result);
        assertTrue(result.contains("FeatureCollection"));
        assertTrue(result.contains("territorio_padre"));
        assertTrue(result.contains("color"));
    }

    @Test
    void getAllColors_shouldReturnDefaultPalette() {
        when(territoryRepository.findDistinctTerritorioPadres()).thenReturn(List.of(1L, 2L));
        when(colorRepository.findAll()).thenReturn(List.of());

        Map<Long, String> result = territoryService.getAllColors();

        assertEquals(2, result.size());
        assertNotNull(result.get(1L));
        assertNotNull(result.get(2L));
    }

    @Test
    void getAllColors_shouldUseAssignedColor() {
        TerritoryColor tc = new TerritoryColor();
        tc.setTerritoryNumber(1L);
        tc.setColor("#ff0000");

        when(territoryRepository.findDistinctTerritorioPadres()).thenReturn(List.of(1L));
        when(colorRepository.findAll()).thenReturn(List.of(tc));

        Map<Long, String> result = territoryService.getAllColors();

        assertEquals("#ff0000", result.get(1L));
    }

    @Test
    void assignColor_shouldSaveColor() {
        when(colorRepository.findById(1L)).thenReturn(Optional.empty());

        territoryService.assignColor(1L, "#3cb44b");

        verify(colorRepository).save(argThat(tc ->
            tc.getTerritoryNumber().equals(1L) && tc.getColor().equals("#3cb44b")
        ));
    }

    @Test
    void assignColor_shouldUpdateExistingColor() {
        TerritoryColor existing = new TerritoryColor();
        existing.setTerritoryNumber(1L);
        existing.setColor("#ff0000");

        when(colorRepository.findById(1L)).thenReturn(Optional.of(existing));

        territoryService.assignColor(1L, "#3cb44b");

        verify(colorRepository).save(argThat(tc ->
            tc.getTerritoryNumber().equals(1L) && tc.getColor().equals("#3cb44b")
        ));
    }

    @Test
    void getTerritoryGeoJson_shouldHandleMultipleManzanas() {
        ManzanaGeoJsonProjection m1 = projection(1L, "1.a", simplePolygonGeojson());
        ManzanaGeoJsonProjection m2 = projection(1L, "1.b", simplePolygonGeojson());

        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m1, m2));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertTrue(result.contains("1.a"));
        assertTrue(result.contains("1.b"));
    }

    @Test
    void getTerritoryGeoJson_shouldSkipEmptyGeometry() {
        ManzanaGeoJsonProjection m = projection(1L, "1.a", null);

        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertTrue(result.contains("FeatureCollection"));
        assertFalse(result.contains("1.a"));
    }

    @Test
    void getTerritoryGeoJson_shouldNotProduceDoubleCommaWhenMiddleGeometryInvalid() {
        ManzanaGeoJsonProjection m1 = projection(1L, "1.a", simplePolygonGeojson());
        ManzanaGeoJsonProjection m2 = projection(1L, "1.b", null);
        ManzanaGeoJsonProjection m3 = projection(1L, "1.c", simplePolygonGeojson());

        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m1, m2, m3));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertFalse(result.contains(",,"), "Las features deben separarse con una sola coma");
        assertTrue(result.contains("1.a"));
        assertTrue(result.contains("1.c"));
        assertFalse(result.contains("1.b"));
    }

    @Test
    void getTerritoryGeoJson_shouldNotProduceTrailingCommaWhenLastGeometryInvalid() throws Exception {
        ManzanaGeoJsonProjection m1 = projection(1L, "1.a", simplePolygonGeojson());
        ManzanaGeoJsonProjection m2 = projection(1L, "1.b", null);

        when(territoryRepository.findGeoJsonByTerritorioPadre(1L)).thenReturn(List.of(m1, m2));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertFalse(result.contains(",]}"), "No debe quedar una coma final antes de cerrar el arreglo");
        com.fasterxml.jackson.databind.JsonNode json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(result);
        assertEquals(1, json.get("features").size());
    }
}
