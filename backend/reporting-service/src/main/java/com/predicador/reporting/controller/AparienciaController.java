package com.predicador.reporting.controller;

import com.predicador.reporting.service.ConfiguracionService;
import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;

/**
 * Cómo se ven los mapas: el administrador ajusta qué tan fuerte se pintan las
 * manzanas predicadas. Público para leer (el mapa de los hermanos y el visor),
 * solo el administrador lo cambia.
 */
@RestController
@RequestMapping("/api/v1/reports")
public class AparienciaController {

    private final ConfiguracionService configuracion;
    private final AuthorizationService authorization;

    public AparienciaController(ConfiguracionService configuracion, AuthorizationService authorization) {
        this.configuracion = configuracion;
        this.authorization = authorization;
    }

    @GetMapping("/public/apariencia")
    public ResponseEntity<Map<String, Double>> apariencia() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(Map.of("opacidadPredicadas", configuracion.opacidadPredicadas()));
    }

    @PutMapping("/admin/apariencia")
    public ResponseEntity<Map<String, Double>> cambiar(@RequestBody Map<String, Double> body, HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        Double opacidad = body == null ? null : body.get("opacidadPredicadas");
        if (opacidad == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta la intensidad.");
        return ResponseEntity.ok(Map.of("opacidadPredicadas", configuracion.setOpacidadPredicadas(opacidad)));
    }
}
