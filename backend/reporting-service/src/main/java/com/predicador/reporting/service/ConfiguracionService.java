package com.predicador.reporting.service;

import com.predicador.reporting.model.AppConfig;
import com.predicador.reporting.repository.AppConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/** Ajustes que el administrador cambia desde el panel. */
@Service
public class ConfiguracionService {

    static final String REGISTRO_ABIERTO = "registro_abierto";
    static final String WHATSAPP_ADMINISTRADOR = "whatsapp_administrador";
    static final String FUERA_DE_META = "territorios_fuera_de_meta";
    static final String CAPACITACION = "capacitacion";
    static final String OPACIDAD_PREDICADAS = "opacidad_predicadas";
    static final String WHATSAPP_COPIA = "whatsapp_copia_reportes";

    /** Intensidad de lo predicado en los mapas: por defecto, y los límites para que siempre se distinga. */
    public static final double OPACIDAD_PREDICADAS_POR_DEFECTO = 0.6;
    public static final double OPACIDAD_PREDICADAS_MINIMA = 0.3;
    public static final double OPACIDAD_PREDICADAS_MAXIMA = 0.95;

    /**
     * Capacitación en curso: desde cuándo y cuál era el último reporte que ya
     * existía. Todo reporte con un id mayor es de prueba.
     */
    public record Capacitacion(Instant desde, long ultimoReporte) {
    }

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

    /**
     * Número al que llega una copia de cada reporte que los hermanos envían
     * desde la app (WhatsApp no deja escribir en el grupo, y se olvidaban de
     * reenviarlo). Sin configurar: no hay copia.
     */
    @Transactional(readOnly = true)
    public String whatsappCopia() {
        return repository.findById(WHATSAPP_COPIA)
                .map(AppConfig::getValor)
                .filter(v -> !v.isBlank())
                .orElse(null);
    }

    /** {@code null} o vacío: sin copia. */
    @Transactional
    public void setWhatsappCopia(String telefono) {
        AppConfig config = repository.findById(WHATSAPP_COPIA).orElseGet(() -> new AppConfig(WHATSAPP_COPIA, ""));
        config.setValor(telefono == null ? "" : telefono);
        repository.save(config);
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

    /**
     * Qué tan fuerte se pintan las manzanas predicadas en el mapa de los
     * hermanos y en el visor (0 a 1). Algunos hermanos las veían «muy claritas».
     */
    @Transactional(readOnly = true)
    public double opacidadPredicadas() {
        return repository.findById(OPACIDAD_PREDICADAS)
                .map(AppConfig::getValor)
                .map(ConfiguracionService::leerOpacidad)
                .orElse(OPACIDAD_PREDICADAS_POR_DEFECTO);
    }

    /** Guarda la intensidad dentro de los límites, con dos decimales; devuelve la guardada. */
    @Transactional
    public double setOpacidadPredicadas(double opacidad) {
        double limpia = Double.isNaN(opacidad) ? OPACIDAD_PREDICADAS_POR_DEFECTO
                : Math.round(Math.clamp(opacidad, OPACIDAD_PREDICADAS_MINIMA, OPACIDAD_PREDICADAS_MAXIMA) * 100) / 100.0;
        AppConfig config = repository.findById(OPACIDAD_PREDICADAS).orElseGet(() -> new AppConfig(OPACIDAD_PREDICADAS, ""));
        config.setValor(String.valueOf(limpia));
        repository.save(config);
        return limpia;
    }

    private static double leerOpacidad(String valor) {
        try {
            double v = Double.parseDouble(valor.strip());
            return Double.isNaN(v) ? OPACIDAD_PREDICADAS_POR_DEFECTO
                    : Math.clamp(v, OPACIDAD_PREDICADAS_MINIMA, OPACIDAD_PREDICADAS_MAXIMA);
        } catch (NumberFormatException | NullPointerException e) {
            return OPACIDAD_PREDICADAS_POR_DEFECTO;
        }
    }

    /** La capacitación en curso, si hay una. Un valor que no se entiende cuenta como ninguna. */
    @Transactional(readOnly = true)
    public Optional<Capacitacion> capacitacion() {
        return repository.findById(CAPACITACION)
                .map(AppConfig::getValor)
                .flatMap(ConfiguracionService::leerCapacitacion);
    }

    /** {@code null}: no hay capacitación. */
    @Transactional
    public void setCapacitacion(Capacitacion capacitacion) {
        AppConfig config = repository.findById(CAPACITACION).orElseGet(() -> new AppConfig(CAPACITACION, ""));
        config.setValor(capacitacion == null ? "" : capacitacion.desde() + "|" + capacitacion.ultimoReporte());
        repository.save(config);
    }

    private static Optional<Capacitacion> leerCapacitacion(String valor) {
        if (valor == null || valor.isBlank()) return Optional.empty();
        String[] partes = valor.split("\\|");
        if (partes.length != 2) return Optional.empty();
        try {
            return Optional.of(new Capacitacion(Instant.parse(partes[0].strip()), Long.parseLong(partes[1].strip())));
        } catch (DateTimeParseException | NumberFormatException e) {
            return Optional.empty();
        }
    }
}
