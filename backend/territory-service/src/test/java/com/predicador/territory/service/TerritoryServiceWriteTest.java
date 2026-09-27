package com.predicador.territory.service;

import com.predicador.territory.geojson.HibernateSpatialTerritoryGeoJsonSerializer;
import com.predicador.territory.model.TerritoryColor;
import com.predicador.territory.repository.TerritoryColorRepository;
import com.predicador.territory.repository.TerritoryRepository;
import com.predicador.territory.tile.DataChangedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests que verifican la publicación de {@link DataChangedEvent}
 * desde {@link TerritoryService#assignColor} (F2).
 */
@ExtendWith(MockitoExtension.class)
class TerritoryServiceWriteTest {

    @Mock
    private TerritoryRepository territoryRepository;

    @Mock
    private TerritoryColorRepository colorRepository;

    @Mock
    private ApplicationEventPublisher publisher;

    private TerritoryService territoryService;

    @BeforeEach
    void setUp() {
        territoryService = new TerritoryService(
                territoryRepository,
                colorRepository,
                new HibernateSpatialTerritoryGeoJsonSerializer(),
                null,
                publisher);
    }

    @Test
    void assignColor_publishesDataChangedEvent() {
        when(colorRepository.findById(5L)).thenReturn(Optional.empty());

        territoryService.assignColor(5L, "#3cb44b");

        ArgumentCaptor<DataChangedEvent> captor = ArgumentCaptor.forClass(DataChangedEvent.class);
        verify(publisher).publishEvent(captor.capture());

        DataChangedEvent event = captor.getValue();
        assertThat(event.manzanaIds()).isEmpty();
        assertThat(event.territorioPadre()).isEqualTo(5L);
        assertThat(event.recomputeCovers()).isFalse();
        assertThat(event.refreshDissolved()).isFalse();
    }

    @Test
    void assignColor_publishesEventAfterSave() {
        TerritoryColor existing = new TerritoryColor();
        existing.setTerritoryNumber(5L);
        existing.setColor("#ff0000");
        when(colorRepository.findById(5L)).thenReturn(Optional.of(existing));

        territoryService.assignColor(5L, "#3cb44b");

        // Verificar que save fue llamado antes del publishEvent
        verify(colorRepository).save(argThat(tc ->
                tc.getTerritoryNumber().equals(5L) && tc.getColor().equals("#3cb44b")));

        ArgumentCaptor<DataChangedEvent> captor = ArgumentCaptor.forClass(DataChangedEvent.class);
        verify(publisher).publishEvent(captor.capture());
        assertThat(captor.getValue().territorioPadre()).isEqualTo(5L);
    }

    @Test
    void assignColor_noPublisher_doesNotThrow() {
        // Construir TerritoryService sin publisher (null)
        TerritoryService svc = new TerritoryService(
                territoryRepository,
                colorRepository,
                new HibernateSpatialTerritoryGeoJsonSerializer(),
                null,
                null);

        when(colorRepository.findById(7L)).thenReturn(Optional.empty());

        // No debe lanzar NullPointerException
        svc.assignColor(7L, "#00ff00");

        verify(colorRepository).save(any());
        // publisher es null → no se llama publishEvent
    }
}
