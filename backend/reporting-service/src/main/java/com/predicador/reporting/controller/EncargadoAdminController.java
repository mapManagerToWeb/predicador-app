package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoAdminDto;
import com.predicador.reporting.dto.EncargadoAdminRequest;
import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.reporting.service.EncargadoAdminService;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Encargados y credenciales en el panel de administración. Todo
 * {@code /api/v1/encargados/admin/**} exige rol admin: por URL
 * ({@code SecurityRules}) y además en cada handler ({@code requireAdmin},
 * ADR 0016).
 */
@RestController
@RequestMapping("/api/v1/encargados/admin")
public class EncargadoAdminController {

    private final EncargadoAdminService service;
    private final ConfiguracionService configuracion;
    private final AuthorizationService authorization;

    public EncargadoAdminController(EncargadoAdminService service, ConfiguracionService configuracion,
                                    AuthorizationService authorization) {
        this.service = service;
        this.configuracion = configuracion;
        this.authorization = authorization;
    }

    @GetMapping
    public ResponseEntity<List<EncargadoAdminDto>> listar(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.listar());
    }

    @PostMapping
    public ResponseEntity<EncargadoAdminDto> crear(@Valid @RequestBody EncargadoAdminRequest requestBody,
                                                   HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(requestBody));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EncargadoAdminDto> actualizar(@PathVariable Long id,
                                                        @Valid @RequestBody EncargadoAdminRequest requestBody,
                                                        HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.actualizar(id, requestBody));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        service.eliminar(id);
        return ResponseEntity.noContent().build();
    }

    /** El PIN se devuelve en claro solo en esta respuesta; después solo queda su hash. */
    @PostMapping("/{id}/pin")
    public ResponseEntity<Map<String, String>> generarPin(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(Map.of("pin", service.generarPin(id)));
    }

    @DeleteMapping("/{id}/pin")
    public ResponseEntity<EncargadoAdminDto> quitarPin(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.quitarPin(id));
    }

    @PostMapping("/{id}/desbloquear")
    public ResponseEntity<EncargadoAdminDto> desbloquear(@PathVariable Long id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.desbloquear(id));
    }

    @PostMapping("/{id}/fusionar/{destinoId}")
    public ResponseEntity<EncargadoAdminDto> fusionar(@PathVariable Long id, @PathVariable Long destinoId,
                                                       HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.fusionar(id, destinoId));
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Boolean>> config(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(Map.of("registroAbierto", configuracion.registroAbierto()));
    }

    @PutMapping("/config")
    public ResponseEntity<Map<String, Boolean>> actualizarConfig(@RequestBody Map<String, Boolean> body,
                                                                 HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        Boolean abierto = body.get("registroAbierto");
        if (abierto == null) {
            throw new IllegalArgumentException("registroAbierto es obligatorio");
        }
        configuracion.setRegistroAbierto(abierto);
        return ResponseEntity.ok(Map.of("registroAbierto", configuracion.registroAbierto()));
    }
}
