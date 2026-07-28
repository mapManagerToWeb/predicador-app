package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.dto.LoginResponse;
import com.predicador.reporting.service.EncargadoService;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/encargados")
public class EncargadoController {

    private final EncargadoService encargadoService;
    private final SessionTokenService tokens;

    public EncargadoController(EncargadoService encargadoService, SessionTokenService tokens) {
        this.encargadoService = encargadoService;
        this.tokens = tokens;
    }

    @GetMapping
    public ResponseEntity<List<EncargadoDto>> listarActivos() {
        return ResponseEntity.ok(encargadoService.listarActivos());
    }

    @PostMapping
    public ResponseEntity<EncargadoDto> crear(@Valid @RequestBody EncargadoDto dto) {
        return ResponseEntity.ok(encargadoService.crear(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EncargadoDto> actualizar(@PathVariable Long id, @Valid @RequestBody EncargadoDto dto) {
        return ResponseEntity.ok(encargadoService.actualizar(id, dto));
    }

    @GetMapping("/buscar")
    public ResponseEntity<List<EncargadoDto>> buscar(@RequestParam String nombre) {
        return ResponseEntity.ok(encargadoService.buscarPorNombre(nombre));
    }

    @PostMapping("/buscar-crear")
    public ResponseEntity<LoginResponse> buscarOCrear(@RequestBody Map<String, String> body) {
        String nombre = body.getOrDefault("nombre", "");
        String apellido = body.getOrDefault("apellido", "");
        String telefono = body.get("telefono");
        return encargadoService.buscarOCrear(nombre, apellido, telefono)
                .map(this::withToken)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.badRequest().build());
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody Map<String, String> body) {
        String telefono = body.get("telefono");
        return encargadoService.buscarPorTelefono(telefono)
                .map(this::withToken)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Package-private helper: mints a session token bound to the encargado id
     * and wraps the DTO. If tokens are not configured yet (secret empty in
     * dev), returns {@code null} for the token so the frontend continues to
     * work while opt-in security rolls out.
     */
    private LoginResponse withToken(EncargadoDto dto) {
        String token = null;
        if (tokens.isConfigured() && dto.id() != null) {
            token = tokens.issue(String.valueOf(dto.id()), SessionToken.ROLE_ENCARGADO);
        }
        return new LoginResponse(dto, token);
    }
}
