package com.predicador.territory.controller;

import com.predicador.territory.dto.ImportResultado;
import com.predicador.territory.dto.ManzanaAdminRequest;
import com.predicador.territory.dto.ManzanaAdminResponse;
import com.predicador.territory.dto.ReasignarManzanasRequest;
import com.predicador.territory.service.ManzanaAdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Editor de manzanas y territorios del panel de administración.
 *
 * <p>Todo {@code /api/v1/territories/admin/**} exige rol admin
 * ({@code SecurityRules.TERRITORY}, y también en el gateway).</p>
 */
@RestController
@RequestMapping("/api/v1/territories/admin")
public class TerritoryAdminController {

    /** Tope del archivo a importar: holgado para miles de manzanas. */
    static final int MAX_IMPORT_BYTES = 20 * 1024 * 1024;

    private final ManzanaAdminService service;

    public TerritoryAdminController(ManzanaAdminService service) {
        this.service = service;
    }

    @GetMapping(value = "/manzanas", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> listar() {
        return ResponseEntity.ok(service.listarGeoJson());
    }

    @GetMapping("/manzanas/{id}")
    public ResponseEntity<ManzanaAdminResponse> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(service.obtener(id));
    }

    @PostMapping("/manzanas")
    public ResponseEntity<ManzanaAdminResponse> crear(@Valid @RequestBody ManzanaAdminRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(request));
    }

    @PutMapping("/manzanas/{id}")
    public ResponseEntity<ManzanaAdminResponse> actualizar(@PathVariable Long id,
                                                           @Valid @RequestBody ManzanaAdminRequest request) {
        return ResponseEntity.ok(service.actualizar(id, request));
    }

    @DeleteMapping("/manzanas/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable Long id) {
        service.eliminar(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/manzanas/{id}/reparar")
    public ResponseEntity<ManzanaAdminResponse> reparar(@PathVariable Long id) {
        return ResponseEntity.ok(service.reparar(id));
    }

    @PostMapping("/manzanas/reasignar")
    public ResponseEntity<Map<String, Integer>> reasignar(@Valid @RequestBody ReasignarManzanasRequest request) {
        return ResponseEntity.ok(Map.of("actualizadas", service.reasignar(request.ids(), request.territorio())));
    }

    @DeleteMapping("/territorios/{numero}")
    public ResponseEntity<Map<String, Integer>> eliminarTerritorio(@PathVariable Long numero) {
        return ResponseEntity.ok(Map.of("eliminadas", service.eliminarTerritorio(numero)));
    }

    @PostMapping(value = "/importar", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ImportResultado> importar(@RequestBody String featureCollection) {
        if (featureCollection.length() > MAX_IMPORT_BYTES) {
            throw new IllegalArgumentException("El archivo supera los 20 MB");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.importar(featureCollection));
    }

    @GetMapping("/calidad")
    public ResponseEntity<Map<String, Object>> calidad() {
        return ResponseEntity.ok(service.calidad());
    }
}
