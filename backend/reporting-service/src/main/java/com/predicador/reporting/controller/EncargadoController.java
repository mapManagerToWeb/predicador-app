package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.service.EncargadoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    public ResponseEntity<EncargadoDto> crear(@RequestBody EncargadoDto dto) {
        return ResponseEntity.ok(encargadoService.crear(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<EncargadoDto> actualizar(@PathVariable Long id, @RequestBody EncargadoDto dto) {
        return ResponseEntity.ok(encargadoService.actualizar(id, dto));
    }

    @GetMapping("/buscar")
    public ResponseEntity<List<EncargadoDto>> buscar(@RequestParam String nombre) {
        return ResponseEntity.ok(encargadoService.buscarPorNombre(nombre));
    }
}
