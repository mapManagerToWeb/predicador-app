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
}
