package com.predicador.reporting.controller;

import com.predicador.reporting.dto.EnvioWhatsAppDto;
import com.predicador.reporting.dto.ReporteAdminDto;
import com.predicador.reporting.service.ReportAdminService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * Reportes para la analítica del panel. Todo {@code /api/v1/reports/admin/**}
 * exige rol admin ({@code SecurityRules}).
 */
@RestController
@RequestMapping("/api/v1/reports/admin")
public class ReportAdminController {

    private final ReportAdminService service;

    public ReportAdminController(ReportAdminService service) {
        this.service = service;
    }

    /** Reportes de {@code [desde, hasta)}; por defecto, los últimos 365 días. */
    @GetMapping
    public ResponseEntity<List<ReporteAdminDto>> listar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant hasta) {
        Instant fin = hasta != null ? hasta : Instant.now().plus(1, ChronoUnit.MINUTES);
        Instant inicio = desde != null ? desde : fin.minus(365, ChronoUnit.DAYS);
        return ResponseEntity.ok(service.listar(inicio, fin));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Integer>> eliminar(@RequestParam List<Integer> ids) {
        return ResponseEntity.ok(Map.of("eliminados", service.eliminar(ids)));
    }

    @GetMapping("/whatsapp")
    public ResponseEntity<List<EnvioWhatsAppDto>> envios() {
        return ResponseEntity.ok(service.enviosRecientes());
    }
}
