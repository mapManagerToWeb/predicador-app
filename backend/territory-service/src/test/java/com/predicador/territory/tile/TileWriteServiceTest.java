package com.predicador.territory.tile;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests del listener de escritura MVT (F2, SPEC §5.3).
 *
 * <p>Cubre: bump de versión, recompute de covers S2, refresh de
 * disueltos, y resiliencia ante excepciones (nunca relanza).</p>
 */
@ExtendWith(MockitoExtension.class)
class TileWriteServiceTest {

    @Mock
    private DataVersionService dataVersionService;

    @Mock
    private S2CoverService s2CoverService;

    @Mock
    private TerritoryTileRepository tileRepository;

    private SimpleMeterRegistry registry;
    private TileWriteService service;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        service = new TileWriteService(dataVersionService, s2CoverService, tileRepository, registry);
    }

    // ── Test 1: solo bump (sin covers ni disueltos) ───────────────────

    @Test
    void onDataChanged_onlyBumpsVersion() {
        DataChangedEvent event = new DataChangedEvent(Set.of(), 10L, false, false);

        service.onDataChanged(event);

        verify(dataVersionService).bumpVersion();
        verifyNoInteractions(s2CoverService);
        verifyNoInteractions(tileRepository);
    }

    // ── Test 2: bump + recomputeCovers + refreshDissolved ──────────────

    @Test
    void onDataChanged_recomputesCoversAndRefreshesDissolved() {
        Set<Long> manzanaIds = Set.of(1L, 2L);
        DataChangedEvent event = new DataChangedEvent(manzanaIds, 10L, true, true);

        // Mock geometría para manzana 1
        TerritoryTileRepository.ManzanaGeometryRow row1 = mock(TerritoryTileRepository.ManzanaGeometryRow.class);
        when(row1.geom()).thenReturn("POLYGON ((-70.66 -33.46, -70.64 -33.46, -70.64 -33.44, -70.66 -33.44, -70.66 -33.46))");

        // Mock geometría para manzana 2
        TerritoryTileRepository.ManzanaGeometryRow row2 = mock(TerritoryTileRepository.ManzanaGeometryRow.class);
        when(row2.geom()).thenReturn("POLYGON ((-70.62 -33.46, -70.60 -33.46, -70.60 -33.44, -70.62 -33.44, -70.62 -33.46))");

        when(tileRepository.findManzanaGeometryById(1L)).thenReturn(row1);
        when(tileRepository.findManzanaGeometryById(2L)).thenReturn(row2);

        // Mock S2 cover
        when(s2CoverService.coverOfBBox(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(111L, 222L));

        service.onDataChanged(event);

        // Verificar bump
        verify(dataVersionService).bumpVersion();

        // Verificar recompute covers: 2 manzanas → 2 llamadas a coverOfBBox + replaceS2Cover
        verify(s2CoverService, times(2)).coverOfBBox(anyDouble(), anyDouble(), anyDouble(), anyDouble());
        verify(tileRepository, times(2)).replaceS2Cover(anyLong(), anyList());

        // Verificar refresh dissolved
        verify(tileRepository).refreshTerritorioDisuelto(10L);
    }

    // ── Test 3: excepción no se relanza (resiliencia) ──────────────────

    @Test
    void onDataChanged_doesNotRethrowOnException() {
        DataChangedEvent event = new DataChangedEvent(Set.of(), 10L, false, false);

        doThrow(new RuntimeException("DB down")).when(dataVersionService).bumpVersion();

        // No debe lanzar
        service.onDataChanged(event);

        // Verificar counter de fallos
        Counter failures = registry.find("territory.tile.version.bump-failures").counter();
        assertThat(failures).isNotNull();
        assertThat(failures.count()).isEqualTo(1);

        // Verificar que bumps no se incrementó
        Counter bumps = registry.find("territory.tile.version.bumps").counter();
        assertThat(bumps).isNotNull();
        assertThat(bumps.count()).isZero();
    }

    // ── Test 4: bump exitoso incrementa counter ────────────────────────

    @Test
    void onDataChanged_successfulBumpIncrementsCounter() {
        DataChangedEvent event = new DataChangedEvent(Set.of(), 10L, false, false);

        service.onDataChanged(event);

        Counter bumps = registry.find("territory.tile.version.bumps").counter();
        assertThat(bumps).isNotNull();
        assertThat(bumps.count()).isEqualTo(1);
    }

    // ── Test 5: manzana no encontrada → skip con warn ──────────────────

    @Test
    void onDataChanged_skipsManzanaNotFound() {
        Set<Long> manzanaIds = Set.of(999L);
        DataChangedEvent event = new DataChangedEvent(manzanaIds, 10L, true, false);

        when(tileRepository.findManzanaGeometryById(999L)).thenReturn(null);

        service.onDataChanged(event);

        verify(dataVersionService).bumpVersion();
        verify(tileRepository).findManzanaGeometryById(999L);
        verifyNoMoreInteractions(tileRepository);
        verifyNoInteractions(s2CoverService);
    }

    // ── Test 6: geometría inválida → skip con warn ─────────────────────

    @Test
    void onDataChanged_skipsInvalidGeometry() {
        Set<Long> manzanaIds = Set.of(5L);
        DataChangedEvent event = new DataChangedEvent(manzanaIds, 10L, true, false);

        TerritoryTileRepository.ManzanaGeometryRow row = mock(TerritoryTileRepository.ManzanaGeometryRow.class);
        when(row.geom()).thenReturn("NOT_A_VALID_WKT");
        when(tileRepository.findManzanaGeometryById(5L)).thenReturn(row);

        service.onDataChanged(event);

        verify(dataVersionService).bumpVersion();
        verify(tileRepository).findManzanaGeometryById(5L);
        verifyNoInteractions(s2CoverService);
    }

    // ── Test 7: refreshDissolved sin territorioPadre → skip ────────────

    @Test
    void onDataChanged_skipsRefreshDissolvedWhenTerritorioPadreIsNull() {
        DataChangedEvent event = new DataChangedEvent(Set.of(), null, false, true);

        service.onDataChanged(event);

        verify(dataVersionService).bumpVersion();
        verifyNoInteractions(tileRepository);
    }
}
