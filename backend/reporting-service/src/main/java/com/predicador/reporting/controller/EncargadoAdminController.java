package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoAdminDto;
import com.predicador.reporting.dto.EncargadoAdminRequest;
import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.reporting.service.EncargadoAdminService;
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
 * {@code /api/v1/encargados/admin/**} exige rol admin ({@code SecurityRules}).
 */
@RestController
@RequestMapping("/api/v1/encargados/admin")
public class EncargadoAdminController {

    private final EncargadoAdminService service;
    private final ConfiguracionService configuracion;

    public EncargadoAdminController(EncargadoAdminService service, ConfiguracionService configuracion) {
        this.service = service;
        this.configuracion = configuracion;
    }

    @GetMapping
    public ResponseEntity<List<EncargadoAdminDto>> listar() {
        return ResponseEntity.ok(service.listar());
    }

    @PostMapping
    public ResponseEntity<EncargadoAdminDto> crear(@Valid @RequestBody EncargadoAdminRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EncargadoAdminDto> actualizar(@PathVariable Long id,
                                                        @Valid @RequestBody EncargadoAdminRequest request) {
        return ResponseEntity.ok(service.actualizar(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminar(@PathVariable Long id) {
        service.eliminar(id);
        return ResponseEntity.noContent().build();
    }

    /** El PIN se devuelve en claro solo en esta respuesta; después solo queda su hash. */
    @PostMapping("/{id}/pin")
    public ResponseEntity<Map<String, String>> generarPin(@PathVariable Long id) {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(Map.of("pin", service.generarPin(id)));
    }

    @DeleteMapping("/{id}/pin")
    public ResponseEntity<EncargadoAdminDto> quitarPin(@PathVariable Long id) {
        return ResponseEntity.ok(service.quitarPin(id));
    }

    @PostMapping("/{id}/desbloquear")
    public ResponseEntity<EncargadoAdminDto> desbloquear(@PathVariable Long id) {
        return ResponseEntity.ok(service.desbloquear(id));
    }

    @PostMapping("/{id}/fusionar/{destinoId}")
    public ResponseEntity<EncargadoAdminDto> fusionar(@PathVariable Long id, @PathVariable Long destinoId) {
        return ResponseEntity.ok(service.fusionar(id, destinoId));
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Boolean>> config() {
        return ResponseEntity.ok(Map.of("registroAbierto", configuracion.registroAbierto()));
    }

    @PutMapping("/config")
    public ResponseEntity<Map<String, Boolean>> actualizarConfig(@RequestBody Map<String, Boolean> body) {
        Boolean abierto = body.get("registroAbierto");
        if (abierto == null) {
            throw new IllegalArgumentException("registroAbierto es obligatorio");
        }
        configuracion.setRegistroAbierto(abierto);
        return ResponseEntity.ok(Map.of("registroAbierto", configuracion.registroAbierto()));
    }
}
