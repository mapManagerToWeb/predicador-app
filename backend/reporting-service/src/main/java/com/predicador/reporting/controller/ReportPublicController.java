package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EstadoTerritorioPublico;
import com.predicador.reporting.service.EstadoPublicoService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;

/**
 * Datos del visor público de territorios (sin iniciar sesión). Excluido de la
 * regla de sesión de reportes en {@code SecurityRules}.
 */
@RestController
@RequestMapping("/api/v1/reports/public")
public class ReportPublicController {

    private final EstadoPublicoService service;

    public ReportPublicController(EstadoPublicoService service) {
        this.service = service;
    }

    @GetMapping("/estado")
    public ResponseEntity<List<EstadoTerritorioPublico>> estado() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(service.estados());
    }
}
