package com.predicador.territory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.territory.dto.TerritoryMetadataDto;
import com.predicador.territory.repository.TerritoryRepository;
import com.predicador.territory.tile.DataVersionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the {@code data_version}-keyed response cache of
 * {@link TerritoryMetadataService} (change f5-gps-mode-cwv-hardening, task 2.3).
 */
@ExtendWith(MockitoExtension.class)
class TerritoryMetadataServiceTest {

    @Mock
    private TerritoryRepository territoryRepository;

    @Mock
    private TerritoryService territoryService;

    @Mock
    private DataVersionService dataVersionService;

    private TerritoryMetadataService service;

    @BeforeEach
    void setUp() {
        service = new TerritoryMetadataService(territoryRepository, territoryService,
            dataVersionService, new ObjectMapper());
    }

    private TerritoryRepository.TerritoryMetadataRow row(long numero, String fids) {
        return new TerritoryRepository.TerritoryMetadataRow() {
            @Override
            public Long getNumero() {
                return numero;
            }

            @Override
            public Double getMinLng() {
                return -71.0;
            }

            @Override
            public Double getMinLat() {
                return -33.1;
            }

            @Override
            public Double getMaxLng() {
                return -70.9;
            }

            @Override
            public Double getMaxLat() {
                return -33.0;
            }

            @Override
            public Double getCenterLng() {
                return -70.95;
            }

            @Override
            public Double getCenterLat() {
                return -33.05;
            }

            @Override
            public Long getManzanaCount() {
                return 2L;
            }

            @Override
            public String getFids() {
                return fids;
            }
        };
    }

    @Test
    void getMetadata_cachesResultForSameDataVersion() {
        when(dataVersionService.current()).thenReturn(5L);
        when(territoryRepository.findTerritoryMetadata())
            .thenReturn(List.of(row(7L, "[7100,7101]")));
        when(territoryService.getAllColors()).thenReturn(Map.of(7L, "#ff0000"));

        List<TerritoryMetadataDto> first = service.getMetadata();
        List<TerritoryMetadataDto> second = service.getMetadata();

        assertThat(first).hasSize(1);
        assertThat(first.get(0).numero()).isEqualTo(7L);
        assertThat(first.get(0).color()).isEqualTo("#ff0000");
        assertThat(first.get(0).bounds()).containsExactly(-71.0, -33.1, -70.9, -33.0);
        assertThat(first.get(0).center()).containsExactly(-70.95, -33.05);
        assertThat(first.get(0).manzanaCount()).isEqualTo(2L);
        assertThat(first.get(0).fids()).containsExactly(7100L, 7101L);
        assertThat(second).isSameAs(first);
        verify(territoryRepository, times(1)).findTerritoryMetadata();
        verify(territoryService, times(1)).getAllColors();
    }

    @Test
    void getMetadata_recomputesAfterDataVersionBump() {
        when(dataVersionService.current()).thenReturn(5L, 6L);
        when(territoryRepository.findTerritoryMetadata())
            .thenReturn(List.of(row(7L, "[7100]")))
            .thenReturn(List.of(row(7L, "[7100]"), row(8L, "[8100]")));
        when(territoryService.getAllColors()).thenReturn(Map.of());

        List<TerritoryMetadataDto> before = service.getMetadata();
        List<TerritoryMetadataDto> after = service.getMetadata();

        assertThat(before).hasSize(1);
        assertThat(after).hasSize(2);
        assertThat(after).isNotSameAs(before);
        verify(territoryRepository, times(2)).findTerritoryMetadata();
        verify(territoryService, times(2)).getAllColors();
    }

    @Test
    void getMetadata_returnsEmptyListWhenRepositoryReturnsNoRows() {
        when(dataVersionService.current()).thenReturn(1L);
        when(territoryRepository.findTerritoryMetadata()).thenReturn(List.of());

        assertThat(service.getMetadata()).isEmpty();
        verify(territoryService, times(0)).getAllColors();
    }
}
