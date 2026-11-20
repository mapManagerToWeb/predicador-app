package com.predicador.reporting.service;

import com.predicador.reporting.model.AppConfig;
import com.predicador.reporting.repository.AppConfigRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConfiguracionServiceTest {

    private final AppConfigRepository repository = mock(AppConfigRepository.class);
    private final ConfiguracionService service = new ConfiguracionService(repository);

    @Test
    void sinConfigurar_ningunTerritorioQuedaFueraDeLaMeta() {
        when(repository.findById(ConfiguracionService.FUERA_DE_META)).thenReturn(Optional.empty());
        assertEquals(List.of(), service.territoriosFueraDeMeta());
    }

    @Test
    void leeLaListaGuardada_eIgnoraLoQueNoEsUnNumero() {
        when(repository.findById(ConfiguracionService.FUERA_DE_META))
                .thenReturn(Optional.of(new AppConfig(ConfiguracionService.FUERA_DE_META, "5, 129,x,,130")));
        assertEquals(List.of(5L, 129L, 130L), service.territoriosFueraDeMeta());

        when(repository.findById(ConfiguracionService.FUERA_DE_META))
                .thenReturn(Optional.of(new AppConfig(ConfiguracionService.FUERA_DE_META, " ")));
        assertEquals(List.of(), service.territoriosFueraDeMeta());
    }

    @Test
    void guardaLaListaOrdenadaSinRepetidosNiNegativos() {
        when(repository.findById(ConfiguracionService.FUERA_DE_META)).thenReturn(Optional.empty());
        List<Long> guardada = service.setTerritoriosFueraDeMeta(Arrays.asList(130L, 5L, null, -1L, 5L));
        assertEquals(List.of(5L, 130L), guardada);
        ArgumentCaptor<AppConfig> config = ArgumentCaptor.forClass(AppConfig.class);
        verify(repository).save(config.capture());
        assertEquals("5,130", config.getValue().getValor());
    }

    @Test
    void vaciarLaListaLaDejaEnBlanco() {
        AppConfig existente = new AppConfig(ConfiguracionService.FUERA_DE_META, "5,130");
        when(repository.findById(ConfiguracionService.FUERA_DE_META)).thenReturn(Optional.of(existente));
        assertEquals(List.of(), service.setTerritoriosFueraDeMeta(null));
        assertEquals("", existente.getValor());
    }

    @Test
    void sinCapacitacionGuardada_noHayNinguna() {
        when(repository.findById(ConfiguracionService.CAPACITACION)).thenReturn(Optional.empty());
        assertEquals(Optional.empty(), service.capacitacion());
        when(repository.findById(ConfiguracionService.CAPACITACION))
                .thenReturn(Optional.of(new AppConfig(ConfiguracionService.CAPACITACION, "")));
        assertEquals(Optional.empty(), service.capacitacion());
    }

    @Test
    void guardaYLeeLaCapacitacion() {
        AppConfig existente = new AppConfig(ConfiguracionService.CAPACITACION, "");
        when(repository.findById(ConfiguracionService.CAPACITACION)).thenReturn(Optional.of(existente));
        var c = new ConfiguracionService.Capacitacion(java.time.Instant.parse("2026-11-22T19:00:00Z"), 1234L);
        service.setCapacitacion(c);
        assertEquals("2026-11-22T19:00:00Z|1234", existente.getValor());
        assertEquals(Optional.of(c), service.capacitacion());

        service.setCapacitacion(null);
        assertEquals("", existente.getValor());
        assertEquals(Optional.empty(), service.capacitacion());
    }

    @Test
    void unaCapacitacionMalGuardadaCuentaComoNinguna() {
        for (String valor : List.of("2026-11-22T19:00:00Z", "ayer|12", "2026-11-22T19:00:00Z|x", "a|b|c")) {
            when(repository.findById(ConfiguracionService.CAPACITACION))
                    .thenReturn(Optional.of(new AppConfig(ConfiguracionService.CAPACITACION, valor)));
            assertEquals(Optional.empty(), service.capacitacion(), valor);
        }
    }
}
