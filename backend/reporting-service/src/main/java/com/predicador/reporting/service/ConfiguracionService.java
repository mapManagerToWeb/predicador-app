package com.predicador.reporting.service;

import com.predicador.reporting.model.AppConfig;
import com.predicador.reporting.repository.AppConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

/** Ajustes que el administrador cambia desde el panel. */
@Service
public class ConfiguracionService {

    static final String REGISTRO_ABIERTO = "registro_abierto";
    static final String WHATSAPP_ADMINISTRADOR = "whatsapp_administrador";
    static final String FUERA_DE_META = "territorios_fuera_de_meta";

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

    /**
     * Territorios que no cuentan en el avance de la vuelta (rurales, o los que
     * no se predicarán en una campaña): la imagen para los hermanos y el
     * Resumen los dejan fuera. No cambia reportes, S-13 ni el mapa.
     */
    @Transactional(readOnly = true)
    public List<Long> territoriosFueraDeMeta() {
        return repository.findById(FUERA_DE_META)
                .map(c -> leerNumeros(c.getValor()))
                .orElse(List.of());
    }

    /** Guarda la lista ordenada y sin repetidos; los números negativos se descartan. */
    @Transactional
    public List<Long> setTerritoriosFueraDeMeta(Collection<Long> territorios) {
        List<Long> limpia = (territorios == null ? List.<Long>of() : territorios).stream()
                .filter(t -> t != null && t >= 0)
                .distinct()
                .sorted()
                .toList();
        AppConfig config = repository.findById(FUERA_DE_META)
                .orElseGet(() -> new AppConfig(FUERA_DE_META, ""));
        config.setValor(limpia.stream().map(String::valueOf).collect(Collectors.joining(",")));
        repository.save(config);
        return limpia;
    }

    private static List<Long> leerNumeros(String valor) {
        if (valor == null || valor.isBlank()) return List.of();
        return Arrays.stream(valor.split(","))
                .map(String::strip)
                .filter(v -> v.matches("\\d{1,9}"))
                .map(Long::valueOf)
                .toList();
    }
}
