package com.predicador.reporting.service;

import com.predicador.reporting.model.AppConfig;
import com.predicador.reporting.repository.AppConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ajustes que el administrador cambia desde el panel. */
@Service
public class ConfiguracionService {

    static final String REGISTRO_ABIERTO = "registro_abierto";
    static final String WHATSAPP_ADMINISTRADOR = "whatsapp_administrador";

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

    /**
     * Número al que llega el WhatsApp de lo que registra o envía el
     * administrador desde el panel. Sin configurar: el de {@code WHATSAPP_DESTINATION}.
     */
    @Transactional(readOnly = true)
    public String whatsappAdministrador() {
        return repository.findById(WHATSAPP_ADMINISTRADOR)
                .map(AppConfig::getValor)
                .filter(v -> !v.isBlank())
                .orElse(null);
    }

    /** {@code null} o vacío: vuelve al número del servidor. */
    @Transactional
    public void setWhatsappAdministrador(String telefono) {
        AppConfig config = repository.findById(WHATSAPP_ADMINISTRADOR)
                .orElseGet(() -> new AppConfig(WHATSAPP_ADMINISTRADOR, ""));
        config.setValor(telefono == null ? "" : telefono);
        repository.save(config);
    }
}
