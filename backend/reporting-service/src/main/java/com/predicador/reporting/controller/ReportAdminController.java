package com.predicador.reporting.controller;

import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PutMapping;
import com.predicador.shared.util.PhoneUtil;
import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.reporting.service.RegistroDeSalidas;
import com.predicador.reporting.dto.ReportDto;
import com.predicador.reporting.dto.RegistroSalidaRequest;
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
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import jakarta.servlet.http.HttpServletRequest;
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
 * exige rol admin: por URL ({@code SecurityRules}) y además en cada handler
 * ({@code requireAdmin}, ADR 0016).
 */
@RestController
@RequestMapping("/api/v1/reports/admin")
public class ReportAdminController {

    private final ReportAdminService service;
    private final CicloService ciclos;
    private final CorreccionDeSalidas salidas;
    private final AuthorizationService authorization;

    private final RegistroDeSalidas registro;
    private final ConfiguracionService configuracion;

    public ReportAdminController(ReportAdminService service, CicloService ciclos, CorreccionDeSalidas salidas,
                                 AuthorizationService authorization, RegistroDeSalidas registro,
                                 ConfiguracionService configuracion) {
        this.service = service;
        this.ciclos = ciclos;
        this.salidas = salidas;
        this.authorization = authorization;
        this.registro = registro;
        this.configuracion = configuracion;
    }

    /** Reportes de {@code [desde, hasta)}; por defecto, los últimos 365 días. */
    @GetMapping
    public ResponseEntity<List<ReporteAdminDto>> listar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant hasta,
            HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        Instant fin = hasta != null ? hasta : Instant.now().plus(1, ChronoUnit.MINUTES);
        Instant inicio = desde != null ? desde : fin.minus(365, ChronoUnit.DAYS);
        return ResponseEntity.ok(service.listar(inicio, fin));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Integer>> eliminar(@RequestParam List<Integer> ids,
                                                         HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(Map.of("eliminados", service.eliminar(ids)));
    }

    @GetMapping("/whatsapp")
    public ResponseEntity<List<EnvioWhatsAppDto>> envios(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.enviosRecientes());
    }

    /** Ciclos de territorios, el en curso primero. */
    @GetMapping("/ciclos")
    public ResponseEntity<List<CicloDto>> ciclos(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(ciclos.listar());
    }

    /** Cierra el ciclo en curso (guarda su resumen) y todos los territorios vuelven a empezar. */
    @PostMapping("/ciclos/cerrar")
    public ResponseEntity<CicloDto> cerrarCiclo(@Valid @RequestBody(required = false) CerrarCicloRequest req,
                                                HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(ciclos.cerrar(req == null ? null : req.nota(), req == null ? null : req.desde()));
    }

    /** Corrige el día en que empezó la vuelta actual (sin cerrar otro ciclo). */
    @PostMapping("/ciclos/inicio")
    public ResponseEntity<CicloService.CambioDeInicio> cambiarInicio(@RequestBody Map<String, String> body,
                                                                     HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        String desde = body == null ? null : body.get("desde");
        java.time.LocalDate dia;
        try {
            dia = desde == null || desde.isBlank() ? null : java.time.LocalDate.parse(desde);
        } catch (java.time.format.DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fecha inválida.");
        }
        return ResponseEntity.ok(ciclos.cambiarInicio(dia));
    }

    /** Estado actual (último reporte) de un territorio; 204 si nunca se trabajó. */
    @GetMapping("/estado/{territorio}")
    public ResponseEntity<EstadoTerritorioAdmin> estado(@PathVariable long territorio,
                                                        HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ciclos.estadoActual(territorio).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** El reporte de una salida y lo que había antes en el territorio, para corregirlo. */
    @GetMapping("/{id}/salida")
    public ResponseEntity<SalidaAdminDto> salida(@PathVariable int id, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(salidas.detalle(id));
    }

    /** Corrige o anula el reporte de una salida (ADR 0014); los posteriores se recalculan. */
    @PostMapping("/{id}/corregir")
    public ResponseEntity<ResultadoCorreccionSalida> corregirSalida(@PathVariable int id,
                                                                    @Valid @RequestBody CorreccionSalidaRequest req,
                                                                    HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(salidas.corregir(id, req));
    }

    /** Corrige el estado actual de un territorio; queda como un reporte más. */
    @PostMapping("/correccion")
    public ResponseEntity<Map<String, Integer>> corregir(@Valid @RequestBody CorreccionRequest req,
                                                         HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        Report r = ciclos.corregir(req);
        return ResponseEntity.ok(Map.of("id", r.getId()));
    }

    /**
     * Registra una salida que un hermano informó (p. ej. por WhatsApp): queda
     * como salida de él, igual que si la hubiera enviado desde la app.
     */
    @PostMapping("/salidas")
    public ResponseEntity<ReportDto> registrarSalida(@Valid @RequestBody RegistroSalidaRequest req,
                                                     HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(registro.registrar(req));
    }

    /** Una salida con varios territorios: se guardan todos o ninguno. */
    @PostMapping("/salidas/varias")
    public ResponseEntity<List<ReportDto>> registrarVarias(@Valid @RequestBody List<@Valid RegistroSalidaRequest> salidas,
                                                          HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(registro.registrarVarias(salidas));
    }

    /** Número al que llega el WhatsApp de lo que se registra desde el panel. */
    @GetMapping("/whatsapp-destino")
    public ResponseEntity<Map<String, String>> whatsappDestino(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        String telefono = configuracion.whatsappAdministrador();
        return ResponseEntity.ok(Map.of("telefono", telefono == null ? "" : telefono));
    }

    /** Vacío: vuelve al número configurado en el servidor. */
    @PutMapping("/whatsapp-destino")
    public ResponseEntity<Map<String, String>> cambiarWhatsappDestino(@RequestBody Map<String, String> body,
                                                                      HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        String telefono = body.getOrDefault("telefono", "");
        telefono = telefono == null ? "" : telefono.strip();
        if (!telefono.isEmpty() && !PhoneUtil.esCelularChileno(telefono)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, PhoneUtil.MENSAJE_INVALIDO);
        }
        configuracion.setWhatsappAdministrador(telefono.isEmpty() ? "" : PhoneUtil.normalize(telefono));
        String guardado = configuracion.whatsappAdministrador();
        return ResponseEntity.ok(Map.of("telefono", guardado == null ? "" : guardado));
    }
}
