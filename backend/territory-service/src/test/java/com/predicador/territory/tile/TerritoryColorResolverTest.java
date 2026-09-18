package com.predicador.territory.tile;

import com.predicador.territory.service.TerritoryService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TerritoryColorResolverTest {

    @Test
    void colorFor_delegatesToColorsEndpointSource() {
        TerritoryService territoryService = mock(TerritoryService.class);
        when(territoryService.getAllColors()).thenReturn(Map.of(5L, "#DC143C", 12L, "#00A86B"));

        TerritoryColorResolver resolver = new TerritoryColorResolver(territoryService);

        assertThat(resolver.colorFor(5L)).isEqualTo("#DC143C");
        assertThat(resolver.colorFor(12L)).isEqualTo("#00A86B");
    }

    @Test
    void colorFor_unknownOrNull_returnsNull() {
        TerritoryService territoryService = mock(TerritoryService.class);
        when(territoryService.getAllColors()).thenReturn(Map.of(5L, "#DC143C"));

        TerritoryColorResolver resolver = new TerritoryColorResolver(territoryService);

        assertThat(resolver.colorFor(999L)).isNull();
        assertThat(resolver.colorFor(null)).isNull();
    }
}