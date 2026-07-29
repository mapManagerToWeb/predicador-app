package com.predicador.territory.service;

import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.model.ManzanaTerritorio;
import com.predicador.territory.model.TerritoryColor;
import com.predicador.territory.repository.TerritoryColorRepository;
import com.predicador.territory.repository.TerritoryRepository;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TerritoryServiceTest {

    @Mock
    private TerritoryRepository territoryRepository;

    @Mock
    private TerritoryColorRepository colorRepository;

    private TerritoryService territoryService;

    @BeforeEach
    void setUp() {
        territoryService = new TerritoryService(territoryRepository, colorRepository, new SimpleMeterRegistry());
    }

    private ManzanaTerritorio createManzana(Long id, Long territorioPadre, String nombreBloque, String geometry) {
        ManzanaTerritorio m = new ManzanaTerritorio();
        m.setId(id);
        m.setTerritorioPadre(territorioPadre);
        m.setNombreBloque(nombreBloque);
        m.setGeometry(geometry);
        return m;
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
        ManzanaTerritorio m = createManzana(1L, 1L, "1.a", createSimplePolygonHex());
        when(territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(1L)).thenReturn(List.of(m));
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
        when(territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(99L)).thenReturn(List.of());

        assertThrows(RuntimeException.class, () -> territoryService.getTerritory(99L));
    }

    @Test
    void getTerritoryGeoJson_shouldReturnGeoJson() {
        ManzanaTerritorio m = createManzana(1L, 1L, "1.a", createSimplePolygonHex());
        when(territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(1L)).thenReturn(List.of(m));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertNotNull(result);
        assertTrue(result.contains("FeatureCollection"));
        assertTrue(result.contains("Feature"));
        assertTrue(result.contains("Polygon"));
        assertTrue(result.contains("1.a"));
    }

    @Test
    void getAllTerritoriesGeoJson_shouldReturnAllFeatures() {
        ManzanaTerritorio m1 = createManzana(1L, 1L, "1.a", createSimplePolygonHex());
        ManzanaTerritorio m2 = createManzana(2L, 2L, "2.a", createSimplePolygonHex());

        when(territoryRepository.findAllGroupedByTerritorio()).thenReturn(List.of(m1, m2));
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
        ManzanaTerritorio m1 = createManzana(1L, 1L, "1.a", createSimplePolygonHex());
        ManzanaTerritorio m2 = createManzana(2L, 1L, "1.b", createSimplePolygonHex());

        when(territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(1L)).thenReturn(List.of(m1, m2));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertTrue(result.contains("1.a"));
        assertTrue(result.contains("1.b"));
    }

    @Test
    void getTerritoryGeoJson_shouldSkipEmptyGeometry() {
        ManzanaTerritorio m = createManzana(1L, 1L, "1.a", null);

        when(territoryRepository.findByTerritorioPadreOrderByNombreBloqueAsc(1L)).thenReturn(List.of(m));

        String result = territoryService.getTerritoryGeoJson(1L);

        assertTrue(result.contains("FeatureCollection"));
        assertFalse(result.contains("Feature,"));
    }

    private String createSimplePolygonHex() {
        byte[] bytes = new byte[]{
            0x01,                                           // byteOrder: little-endian
            0x03, 0x00, 0x00, 0x20,                         // geometryType: Polygon with SRID
            0x0E, 0x00, 0x00, 0x00,                         // SRID: 4326
            0x01, 0x00, 0x00, 0x00,                         // numRings: 1
            0x05, 0x00, 0x00, 0x00,                         // numPoints: 5
            // Point 1: (-73.4, -37.4)
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
            // Point 2: (-73.4, -37.5)
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x24, 0x00, 0x00, 0x00,
            // Point 3: (-73.5, -37.5)
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x24, 0x00, 0x00, 0x00,
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x24, 0x00, 0x00, 0x00,
            // Point 4: (-73.5, -37.4)
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x24, 0x00, 0x00, 0x00,
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
            // Point 5: (-73.4, -37.4) - close
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
            0x77, (byte)0xBE, (byte)0x9F, (byte)0xC0, 0x14, 0x00, 0x00, 0x00,
        };

        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
