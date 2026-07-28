package com.predicador.territory.controller;

import com.predicador.territory.dto.TerritoryColorRequest;
import com.predicador.territory.dto.TerritoryDto;
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

    public TerritoryController(TerritoryService territoryService) {
        this.territoryService = territoryService;
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
            @Valid @RequestBody TerritoryColorRequest request) {
        territoryService.assignColor(number, request.color());
        return ResponseEntity.ok().build();
    }
}
