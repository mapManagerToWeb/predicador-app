package com.predicador.territory.controller;

import com.predicador.shared.security.AuthorizationService;
import com.predicador.shared.security.RequestTokens;
import com.predicador.territory.dto.TerritoryColorRequest;
import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.service.TerritoryService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Endpoints de campo de los territorios.
 *
 * <p>{@code PUT /api/v1/territories/{n}/color} exige rol admin: por URL
 * ({@code SecurityRules.TERRITORY}, y tambien en el gateway) y ademas en el
 * propio handler ({@code requireAdmin}, ADR 0016). El filtro de URL se puede
 * esquivar escribiendo la misma ruta de otra forma, y el color de un territorio
 * no es un dato del cliente: es el estado que el panel de administracion
 * escribe para los demas.</p>
 */
@RestController
@RequestMapping("/api/v1/territories")
public class TerritoryController {

    private final TerritoryService territoryService;
    private final AuthorizationService authorization;

    public TerritoryController(TerritoryService territoryService, AuthorizationService authorization) {
        this.territoryService = territoryService;
        this.authorization = authorization;
    }

    @GetMapping
    public ResponseEntity<List<Long>> getTerritoryNumbers() {
        return ResponseEntity.ok(territoryService.getTerritoryNumbers());
    }

    @GetMapping("/all/geojson")
    public ResponseEntity<String> getAllTerritoriesGeoJson() {
        return ResponseEntity.ok(territoryService.getAllTerritoriesGeoJson());
    }

    @GetMapping("/colors")
    public ResponseEntity<Map<Long, String>> getAllColors() {
        return ResponseEntity.ok(territoryService.getAllColors());
    }

    @GetMapping("/{number}")
    public ResponseEntity<TerritoryDto> getTerritory(@PathVariable Long number) {
        return ResponseEntity.ok(territoryService.getTerritory(number));
    }

    @GetMapping("/{number}/geojson")
    public ResponseEntity<String> getTerritoryGeoJson(@PathVariable Long number) {
        return ResponseEntity.ok(territoryService.getTerritoryGeoJson(number));
    }

    @PutMapping("/{number}/color")
    public ResponseEntity<Void> assignColor(
            @PathVariable Long number,
            @Valid @RequestBody TerritoryColorRequest requestBody,
            HttpServletRequest request) {
        authorization.requireAdmin(RequestTokens.token(request));
        territoryService.assignColor(number, requestBody.color());
        return ResponseEntity.ok().build();
    }
}
