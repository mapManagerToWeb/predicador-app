package com.predicador.reporting.service;

import com.predicador.reporting.dto.RegistroSalidaRequest;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.shared.exception.ResourceNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * El administrador registra desde el panel una salida que un hermano le
 * informó (mientras los hermanos aprenden a usar la app). El hermano no
 * necesita cuenta: el reporte guarda su nombre. Si se llama igual que un
 * encargado de la lista, queda enlazado a él, para que su historial sea uno
 * solo cuando empiece a usar la app.
 */
@Service
public class RegistroDeSalidas {

    /** Para distinguir en el panel lo que se registró desde aquí y no desde la app. */
    static final String MARCA = "Registrado desde el panel";

    private final ReportService reportes;
    private final EncargadoRepository encargados;

    public RegistroDeSalidas(ReportService reportes, EncargadoRepository encargados) {
        this.reportes = reportes;
        this.encargados = encargados;
    }

    /** Más de esto en una salida es seguramente un error de la pantalla. */
    static final int MAXIMO_TERRITORIOS = 20;

    /**
     * Una salida en la que se predicaron varios territorios (como en la app):
     * se guardan todos o ninguno. Los candados de territorio se toman siempre
     * en el mismo orden para que dos registros no se traben.
     */
    @Transactional
    public List<ReportDto> registrarVarias(List<RegistroSalidaRequest> salidas) {
        if (salidas == null || salidas.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agrega al menos un territorio.");
        }
        if (salidas.size() > MAXIMO_TERRITORIOS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Una salida puede tener hasta " + MAXIMO_TERRITORIOS + " territorios.");
        }
        Set<Long> territorios = new HashSet<>();
        for (RegistroSalidaRequest s : salidas) {
            if (s == null || s.territorio() == null || s.fechaPredicacion() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cada territorio necesita su número y el día.");
            }
            if (!territorios.add(s.territorio())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "El territorio " + s.territorio() + " está dos veces.");
            }
        }
        return salidas.stream()
                .sorted(Comparator.comparing(RegistroSalidaRequest::territorio))
                .map(this::registrar)
                .toList();
    }

    @Transactional
    public ReportDto registrar(RegistroSalidaRequest req) {
        if (vacio(req.manzanasIds()) && vacio(req.puntosParciales()) && vacio(req.geometriaParcial())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Marca al menos una manzana o una calle.");
        }
        Long id;
        String nombre;
        String apellido;
        if (req.encargadoId() != null) {
            Encargado e = encargados.findById(req.encargadoId())
                    .orElseThrow(() -> new ResourceNotFoundException("Encargado", req.encargadoId()));
            id = e.getId();
            nombre = e.getNombre();
            apellido = e.getApellido();
        } else {
            nombre = limpio(req.encargadoNombre());
            apellido = limpio(req.encargadoApellido());
            if (nombre.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escribe el nombre del hermano que predicó.");
            }
            id = encargados.findByNaturalIdentity(nombre, apellido).map(Encargado::getId).orElse(null);
        }
        String nota = vacio(req.nota()) ? MARCA : MARCA + ": " + req.nota().strip();
        ReportDto salida = new ReportDto(null, null, null, nombre, apellido, null, "incomplete", req.territorio(), id,
                req.totalManzanas(), null, null, vacioANull(req.geometriaParcial()), vacioANull(req.puntosParciales()),
                vacioANull(req.manzanasIds()), null, req.fechaPredicacion(), req.turno());
        return reportes.registrarDelAdministrador(salida, nota);
    }

    private static boolean vacio(String s) {
        return s == null || s.isBlank();
    }

    private static String vacioANull(String s) {
        return vacio(s) ? null : s;
    }

    private static String limpio(String s) {
        return s == null ? "" : s.strip().replaceAll("\\s+", " ");
    }
}
