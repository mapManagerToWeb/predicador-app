package com.predicador.reporting.service;

import com.predicador.reporting.model.Report;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.reporting.service.ConfiguracionService.Capacitacion;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Modo capacitación: mientras dura, los hermanos usan la app de verdad (reportes,
 * WhatsApp, visor) y todo lo que envían es de prueba. Al terminar se borra todo
 * lo guardado después de empezar, así cada territorio vuelve a como estaba.
 *
 * <p>Lo de prueba se reconoce por el id: es mayor que el último reporte que ya
 * existía al empezar (no por la fecha, que puede venir del teléfono). Mientras
 * dura no se puede tocar la historia anterior (cerrar ciclo, cambiar el inicio
 * de la vuelta, corregir reportes de antes): esos cambios no se podrían deshacer.
 */
@Service
public class CapacitacionService {

    /** Una prueba, para que el administrador vea qué se va a borrar. */
    public record Prueba(int id, Instant fecha, Long territorio, String encargado, String estado, String origen) {
    }

    public record Estado(boolean activa, Instant desde, List<Prueba> pruebas) {
    }

    static final String MENSAJE_EN_CURSO =
            "Hay una capacitación en curso. Termínala en el panel antes de hacer este cambio.";

    private final ConfiguracionService configuracion;
    private final ReportRepository reportes;

    public CapacitacionService(ConfiguracionService configuracion, ReportRepository reportes) {
        this.configuracion = configuracion;
        this.reportes = reportes;
    }

    public Optional<Capacitacion> enCurso() {
        return configuracion.capacitacion();
    }

    @Transactional(readOnly = true)
    public Estado estado() {
        return enCurso()
                .map(c -> new Estado(true, c.desde(), reportes.findByIdGreaterThanOrderByIdAsc(limite(c)).stream()
                        .map(CapacitacionService::prueba)
                        .toList()))
                .orElseGet(() -> new Estado(false, null, List.of()));
    }

    /** Empieza la capacitación (si ya había una, sigue la misma). */
    @Transactional
    public Estado empezar() {
        if (enCurso().isEmpty()) {
            configuracion.setCapacitacion(new Capacitacion(Instant.now(), reportes.ultimoId()));
        }
        return estado();
    }

    /**
     * Termina la capacitación. Con {@code borrar} se borran todos los reportes
     * de prueba; devuelve cuántos se borraron.
     */
    @Transactional
    public int terminar(boolean borrar) {
        Capacitacion c = enCurso().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.CONFLICT, "No hay ninguna capacitación en curso."));
        int borrados = borrar ? reportes.borrarDespuesDe(limite(c)) : 0;
        configuracion.setCapacitacion(null);
        return borrados;
    }

    /** Para lo que cambia la historia anterior: no se permite durante una capacitación. */
    public void exigirSinCapacitacion() {
        if (enCurso().isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, MENSAJE_EN_CURSO);
    }

    /** Durante una capacitación solo se corrigen los reportes de prueba. */
    public void exigirQueSeaPrueba(int reporteId) {
        enCurso().ifPresent(c -> {
            if (reporteId <= c.ultimoReporte()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Durante la capacitación solo se corrigen reportes de prueba. Termínala para corregir este.");
            }
        });
    }

    private static int limite(Capacitacion c) {
        return (int) Math.min(Integer.MAX_VALUE, c.ultimoReporte());
    }

    private static Prueba prueba(Report r) {
        String nombre = ((r.getEncargadoNombre() == null ? "" : r.getEncargadoNombre()) + " "
                + (r.getEncargadoApellido() == null ? "" : r.getEncargadoApellido())).strip();
        return new Prueba(r.getId(), r.getFecha(), r.getTerritorioNumero(), nombre.isEmpty() ? null : nombre,
                r.getEstado(), r.getOrigen());
    }
}
