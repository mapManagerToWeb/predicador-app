package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.dto.LoginResponse;
import com.predicador.reporting.service.EncargadoService;
import com.predicador.shared.security.SessionAuthFilter;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.security.SessionTokenService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;

import java.net.URI;
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
    public ResponseEntity<List<EncargadoDto>> listarActivos(HttpServletRequest request) {
        return ResponseEntity.ok(encargadoService.listarActivos(token(request)));
    }

    @PostMapping
    public ResponseEntity<EncargadoDto> crear(@Valid @RequestBody EncargadoDto dto) {
        return ResponseEntity.ok(encargadoService.crear(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EncargadoDto> actualizar(@PathVariable Long id, @Valid @RequestBody EncargadoDto dto,
                                                   HttpServletRequest request) {
        return ResponseEntity.ok(encargadoService.actualizar(id, dto, token(request)));
    }

    @GetMapping("/buscar")
    public ResponseEntity<List<EncargadoDto>> buscar(@RequestParam String nombre, HttpServletRequest request) {
        return ResponseEntity.ok(encargadoService.buscarPorNombre(nombre, token(request)));
    }

    @PostMapping("/buscar-crear")
    public ResponseEntity<?> buscarOCrear(@RequestBody Map<String, String> body) {
        String nombre = body.getOrDefault("nombre", "");
        String apellido = body.getOrDefault("apellido", "");
        String telefono = body.get("telefono");
        var result = encargadoService.buscarOCrear(nombre, apellido, telefono);
        if (result.isPresent()) {
            return ResponseEntity.ok(withToken(result.get()));
        }
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Nombre y apellido son requeridos");
        problem.setTitle("Datos incompletos");
        problem.setType(URI.create("https://api.predicador.com/errors/bad-request"));
        return ResponseEntity.badRequest().body(problem);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String telefono = body.get("telefono");
        var result = encargadoService.buscarPorTelefono(telefono);
        if (result.isPresent()) {
            return ResponseEntity.ok(withToken(result.get()));
        }
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND, "Encargado no encontrado con el teléfono proporcionado");
        problem.setTitle("Encargado no encontrado");
        problem.setType(URI.create("https://api.predicador.com/errors/not-found"));
        problem.setProperty("resource", "Encargado");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
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

    private SessionToken token(HttpServletRequest request) {
        return (SessionToken) request.getAttribute(SessionAuthFilter.ATTR_TOKEN);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail handleAuthorization(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getStatusCode(), exception.getReason());
        problem.setTitle("Acceso denegado");
        problem.setType(URI.create("https://api.predicador.com/errors/forbidden"));
        return problem;
    }
}
