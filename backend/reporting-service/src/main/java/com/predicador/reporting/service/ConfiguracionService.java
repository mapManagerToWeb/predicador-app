package com.predicador.reporting.service;

import com.predicador.reporting.model.AppConfig;
import com.predicador.reporting.repository.AppConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ajustes que el administrador cambia desde el panel. */
@Service
public class ConfiguracionService {

    static final String REGISTRO_ABIERTO = "registro_abierto";

    private final AppConfigRepository repository;

    public ConfiguracionService(AppConfigRepository repository) {
        this.repository = repository;
    }

    /**
     * Si los encargados pueden crear su propio perfil desde la app. Con el
     * registro cerrado solo el administrador da de alta encargados.
     */
    @Transactional(readOnly = true)
    public boolean registroAbierto() {
        return repository.findById(REGISTRO_ABIERTO)
                .map(c -> Boolean.parseBoolean(c.getValor()))
                .orElse(true);
    }

    @Transactional
    public void setRegistroAbierto(boolean abierto) {
        AppConfig config = repository.findById(REGISTRO_ABIERTO)
                .orElseGet(() -> new AppConfig(REGISTRO_ABIERTO, "true"));
        config.setValor(String.valueOf(abierto));
        repository.save(config);
    }
}
