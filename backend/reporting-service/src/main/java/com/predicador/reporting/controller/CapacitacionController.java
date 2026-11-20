package com.predicador.reporting.controller;

import com.predicador.reporting.service.CapacitacionService;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * Modo capacitación ({@link CapacitacionService}). El aviso «capacitación en
 * curso» es público: lo muestran la app y el visor, que no siempre tienen sesión.
 */
@RestController
@RequestMapping("/api/v1/reports")
public class CapacitacionController {

    private final CapacitacionService service;
    private final AuthorizationService authorization;

    public CapacitacionController(CapacitacionService service, AuthorizationService authorization) {
        this.service = service;
        this.authorization = authorization;
    }

    /** Solo si hay una en curso y desde cuándo (nada de los reportes). */
    @GetMapping("/public/capacitacion")
    public ResponseEntity<Map<String, Object>> publica() {
        Map<String, Object> cuerpo = new HashMap<>();
        var enCurso = service.enCurso();
        cuerpo.put("activa", enCurso.isPresent());
        cuerpo.put("desde", enCurso.map(c -> c.desde().toString()).orElse(null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cuerpo);
    }

    @GetMapping("/admin/capacitacion")
    public ResponseEntity<CapacitacionService.Estado> estado(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.estado());
    }

    @PostMapping("/admin/capacitacion/empezar")
    public ResponseEntity<CapacitacionService.Estado> empezar(HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        return ResponseEntity.ok(service.empezar());
    }

    /** {@code {"borrar": true}} borra los reportes de prueba; sin eso se dejan. */
    @PostMapping("/admin/capacitacion/terminar")
    public ResponseEntity<Map<String, Integer>> terminar(@RequestBody(required = false) Map<String, Boolean> body,
                                                         HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        boolean borrar = body != null && Boolean.TRUE.equals(body.get("borrar"));
        return ResponseEntity.ok(Map.of("borrados", service.terminar(borrar)));
    }
}
