package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.service.EncargadoService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/encargados")
public class EncargadoController {

    private final EncargadoService encargadoService;

    public EncargadoController(EncargadoService encargadoService) {
        this.encargadoService = encargadoService;
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
    public ResponseEntity<EncargadoDto> buscarOCrear(@RequestBody Map<String, String> body) {
        String nombre = body.getOrDefault("nombre", "");
        String apellido = body.getOrDefault("apellido", "");
        String telefono = body.get("telefono");
        return encargadoService.buscarOCrear(nombre, apellido, telefono)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.badRequest().build());
    }

    @PostMapping("/login")
    public ResponseEntity<EncargadoDto> login(@RequestBody Map<String, String> body) {
        String telefono = body.get("telefono");
        return encargadoService.buscarPorTelefono(telefono)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
