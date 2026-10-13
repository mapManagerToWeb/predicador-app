package com.predicador.territory.controller;

import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import com.predicador.territory.dto.ImportResultado;
import com.predicador.territory.dto.ManzanaAdminRequest;
import com.predicador.territory.dto.ManzanaAdminResponse;
import com.predicador.territory.dto.ReasignarManzanasRequest;
import com.predicador.territory.service.ManzanaAdminService;
import jakarta.servlet.http.HttpServletRequest;
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
 * <p>Todo {@code /api/v1/territories/admin/**} exige rol admin: por URL
 * ({@code SecurityRules.TERRITORY}, y también en el gateway) y además en cada
 * handler ({@code requireAdmin}, ADR 0016). El filtro de URL se puede esquivar
 * con una ruta equivalente ({@code %61dmin}, {@code //}, {@code /./}); la
 * comprobación en el handler no depende de cómo se escribió la URL.</p>
 */
@RestController
@RequestMapping("/api/v1/territories/admin")
public class TerritoryAdminController {

    /** Tope del archivo a importar: holgado para miles de manzanas. */
    static final int MAX_IMPORT_BYTES = 20 * 1024 * 1024;

    private final ManzanaAdminService service;
    private final AuthorizationService authorization;

    public TerritoryAdminController(ManzanaAdminService service, AuthorizationService authorization) {
        this.service = service;
        this.authorization = authorization;
    }

    @GetMapping(value = "/manzanas", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> listar(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.listarGeoJson());
    }

    @GetMapping("/manzanas/{id}")
    public ResponseEntity<ManzanaAdminResponse> obtener(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.obtener(id));
    }

    @PostMapping("/manzanas")
    public ResponseEntity<ManzanaAdminResponse> crear(@Valid @RequestBody ManzanaAdminRequest requestBody,
                                                       HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(requestBody));
    }

    @PutMapping("/manzanas/{id}")
    public ResponseEntity<ManzanaAdminResponse> actualizar(@PathVariable Long id,
                                                           @Valid @RequestBody ManzanaAdminRequest requestBody,
                                                           HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.actualizar(id, requestBody));
    }

    @DeleteMapping("/manzanas/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        service.eliminar(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/manzanas/{id}/reparar")
    public ResponseEntity<ManzanaAdminResponse> reparar(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.reparar(id));
    }

    @PostMapping("/manzanas/reasignar")
    public ResponseEntity<Map<String, Integer>> reasignar(@Valid @RequestBody ReasignarManzanasRequest requestBody,
                                                          HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(Map.of("actualizadas", service.reasignar(requestBody.ids(), requestBody.territorio())));
    }

    @DeleteMapping("/territorios/{numero}")
    public ResponseEntity<Map<String, Integer>> eliminarTerritorio(@PathVariable Long numero,
                                                                   HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(Map.of("eliminadas", service.eliminarTerritorio(numero)));
    }

    @PostMapping(value = "/importar", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ImportResultado> importar(@RequestBody String featureCollection,
                                                    HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        if (featureCollection.length() > MAX_IMPORT_BYTES) {
            throw new IllegalArgumentException("El archivo supera los 20 MB");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.importar(featureCollection));
    }

    @GetMapping("/calidad")
    public ResponseEntity<Map<String, Object>> calidad(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.calidad());
    }
}
