package com.predicador.reporting.controller;

import com.predicador.reporting.dto.CerrarCicloRequest;
import com.predicador.reporting.dto.CicloDto;
import com.predicador.reporting.dto.CorreccionRequest;
import com.predicador.reporting.dto.CorreccionSalidaRequest;
import com.predicador.reporting.dto.ResultadoCorreccionSalida;
import com.predicador.reporting.dto.SalidaAdminDto;
import com.predicador.reporting.dto.EnvioWhatsAppDto;
import com.predicador.reporting.dto.EstadoTerritorioAdmin;
import com.predicador.reporting.dto.ReporteAdminDto;
import com.predicador.reporting.model.Report;
import com.predicador.reporting.service.CicloService;
import com.predicador.reporting.service.CorreccionDeSalidas;
import com.predicador.reporting.service.ReportAdminService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
    private final CicloService ciclos;
    private final CorreccionDeSalidas salidas;

    public ReportAdminController(ReportAdminService service, CicloService ciclos, CorreccionDeSalidas salidas) {
        this.service = service;
        this.ciclos = ciclos;
        this.salidas = salidas;
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

    /** Ciclos de territorios, el en curso primero. */
    @GetMapping("/ciclos")
    public ResponseEntity<List<CicloDto>> ciclos() {
        return ResponseEntity.ok(ciclos.listar());
    }

    /** Cierra el ciclo en curso (guarda su resumen) y todos los territorios vuelven a empezar. */
    @PostMapping("/ciclos/cerrar")
    public ResponseEntity<CicloDto> cerrarCiclo(@Valid @RequestBody(required = false) CerrarCicloRequest req) {
        return ResponseEntity.ok(ciclos.cerrar(req == null ? null : req.nota()));
    }

    /** Estado actual (último reporte) de un territorio; 204 si nunca se trabajó. */
    @GetMapping("/estado/{territorio}")
    public ResponseEntity<EstadoTerritorioAdmin> estado(@PathVariable long territorio) {
        return ciclos.estadoActual(territorio).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** El reporte de una salida y lo que había antes en el territorio, para corregirlo. */
    @GetMapping("/{id}/salida")
    public ResponseEntity<SalidaAdminDto> salida(@PathVariable int id) {
        return ResponseEntity.ok(salidas.detalle(id));
    }

    /** Corrige o anula el reporte de una salida (ADR 0014); los posteriores se recalculan. */
    @PostMapping("/{id}/corregir")
    public ResponseEntity<ResultadoCorreccionSalida> corregirSalida(@PathVariable int id,
                                                                    @Valid @RequestBody CorreccionSalidaRequest req) {
        return ResponseEntity.ok(salidas.corregir(id, req));
    }

    /** Corrige el estado actual de un territorio; queda como un reporte más. */
    @PostMapping("/correccion")
    public ResponseEntity<Map<String, Integer>> corregir(@Valid @RequestBody CorreccionRequest req) {
        Report r = ciclos.corregir(req);
        return ResponseEntity.ok(Map.of("id", r.getId()));
    }
}
