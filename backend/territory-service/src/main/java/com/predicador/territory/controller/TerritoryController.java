package com.predicador.territory.controller;

import com.predicador.territory.dto.TerritoryColorRequest;
import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.dto.TerritoryMetadataDto;
import com.predicador.territory.service.TerritoryMetadataService;
import com.predicador.territory.service.TerritoryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/territories")
public class TerritoryController {

    private final TerritoryService territoryService;
    private final TerritoryMetadataService territoryMetadataService;

    public TerritoryController(TerritoryService territoryService,
                               TerritoryMetadataService territoryMetadataService) {
        this.territoryService = territoryService;
        this.territoryMetadataService = territoryMetadataService;
    }

    @GetMapping
    public ResponseEntity<List<Long>> getTerritoryNumbers() {
        return ResponseEntity.ok(territoryService.getTerritoryNumbers());
    }

    /**
     * Metadatos ligeros por territorio (identidad, color, bounds, centro,
     * conteo, fids) sin geometría — reemplaza la información no geométrica
     * que el frontend derivaba del snapshot bulk retirado en F5.
     */
    @GetMapping("/metadata")
    public ResponseEntity<List<TerritoryMetadataDto>> getTerritoriesMetadata() {
        return ResponseEntity.ok(territoryMetadataService.getMetadata());
    }

    @GetMapping("/colors")
    public ResponseEntity<Map<Long, String>> getAllColors() {
        return ResponseEntity.ok(territoryService.getAllColors());
    }

    // Restricción \d+ en {number}: sin ella, la ruta retirada del snapshot
    // bulk caería en /{number}/geojson con number="all" y el fallo de
    // conversión a Long produciría 400/500 en vez del 404 que exige la
    // spec (bulk snapshot ausente).
    @GetMapping("/{number:\\d+}")
    public ResponseEntity<TerritoryDto> getTerritory(@PathVariable Long number) {
        return ResponseEntity.ok(territoryService.getTerritory(number));
    }

    @GetMapping("/{number:\\d+}/geojson")
    public ResponseEntity<String> getTerritoryGeoJson(@PathVariable Long number) {
        return ResponseEntity.ok(territoryService.getTerritoryGeoJson(number));
    }

    @PutMapping("/{number:\\d+}/color")
    public ResponseEntity<Void> assignColor(
            @PathVariable Long number,
            @Valid @RequestBody TerritoryColorRequest request) {
        territoryService.assignColor(number, request.color());
        return ResponseEntity.ok().build();
    }
}
