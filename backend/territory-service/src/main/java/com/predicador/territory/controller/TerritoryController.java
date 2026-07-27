package com.predicador.territory.controller;

import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.service.TerritoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/v1/territories")
public class TerritoryController {

    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final TerritoryService territoryService;

    public TerritoryController(TerritoryService territoryService) {
        this.territoryService = territoryService;
    }

    @GetMapping
    public ResponseEntity<java.util.List<Long>> getTerritoryNumbers() {
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
    public ResponseEntity<Void> assignColor(@PathVariable Long number, @RequestBody Map<String, String> body) {
        String color = body.get("color");
        if (color == null || !HEX_COLOR.matcher(color).matches()) {
            return ResponseEntity.badRequest().build();
        }
        territoryService.assignColor(number, color);
        return ResponseEntity.ok().build();
    }
}
