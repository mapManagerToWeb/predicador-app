package com.predicador.territory.service;

import com.predicador.territory.config.CacheConfig;
import com.predicador.territory.dto.TerritoryDto;
import com.predicador.territory.geojson.TerritoryGeoJsonSerializer;
import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.territory.model.TerritoryColor;
import com.predicador.territory.repository.TerritoryColorRepository;
import com.predicador.territory.repository.TerritoryRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class TerritoryService {

    private final TerritoryRepository territoryRepository;
    private final TerritoryColorRepository colorRepository;
    private final TerritoryGeoJsonSerializer geoJsonSerializer;
    private final ObjectProvider<TerritoryService> self;
    private final Timer geojsonLoadTimer;

    private static final String[] PALETTE = {
        "#DC143C", "#00A86B", "#007FFF", "#FF6600", "#8A2BE2",
        "#E0115F", "#FFBF00", "#00CED1", "#FF1493", "#32CD32",
        "#FF4500", "#1E90FF", "#DA70D6", "#FFD700", "#00FF7F",
        "#FF00FF", "#4169E1", "#FF69B4", "#7B68EE"
    };

    public TerritoryService(TerritoryRepository territoryRepository, TerritoryColorRepository colorRepository, TerritoryGeoJsonSerializer geoJsonSerializer, MeterRegistry registry) {
        this(territoryRepository, colorRepository, geoJsonSerializer, registry, null);
    }

    @Autowired
    public TerritoryService(TerritoryRepository territoryRepository, TerritoryColorRepository colorRepository, TerritoryGeoJsonSerializer geoJsonSerializer, MeterRegistry registry,
                            ObjectProvider<TerritoryService> self) {
        this.territoryRepository = territoryRepository;
        this.colorRepository = colorRepository;
        this.geoJsonSerializer = geoJsonSerializer;
        this.self = self;
        this.geojsonLoadTimer = Timer.builder("territory.geojson.load.duration")
                .description("Tiempo para generar el GeoJSON completo de todos los territorios")
                .register(registry);
    }

    /**
     * Returns the Spring proxy of this bean when available so that
     * {@code @Cacheable} annotations are honored even on internal calls
     * (self-invocation would otherwise bypass the cache). Falls back to
     * {@code this} for direct construction in unit tests.
     */
    private TerritoryService self() {
        return self == null ? this : self.getObject();
    }

    @Cacheable(CacheConfig.CACHE_NUMBERS)
    public List<Long> getTerritoryNumbers() {
        return territoryRepository.findDistinctTerritorioPadres();
    }

    public TerritoryDto getTerritory(Long number) {
        // No cacheado individualmente: la mayoría del tráfico usa el endpoint
        // /all/geojson agregado. Cachear cada TerritoryDto duplicaría memoria.
        List<TerritoryRepository.ManzanaGeoJsonProjection> manzanas =
                territoryRepository.findGeoJsonByTerritorioPadre(number);
        if (manzanas.isEmpty()) {
            throw new ResourceNotFoundException("Territorio", number);
        }

        String color = getColorForTerritory(number);
        String geoJson = geoJsonSerializer.serializeTerritory(manzanas, color);
        String name = "Territorio " + number;

        return new TerritoryDto(number, name, geoJson, color);
    }

    @Cacheable(value = CacheConfig.CACHE_GEOJSON_ONE, key = "#number")
    public String getTerritoryGeoJson(Long number) {
        List<TerritoryRepository.ManzanaGeoJsonProjection> manzanas =
                territoryRepository.findGeoJsonByTerritorioPadre(number);
        if (manzanas.isEmpty()) {
            throw new ResourceNotFoundException("Territorio", number);
        }
        return geoJsonSerializer.serializeTerritory(manzanas, getColorForTerritory(number));
    }

    @Cacheable(CacheConfig.CACHE_GEOJSON_ALL)
    public String getAllTerritoriesGeoJson() {
        long start = System.nanoTime();
        try {
            return territoryRepository.findAllGeoJsonAsFeatureCollection();
        } finally {
            long elapsed = System.nanoTime() - start;
            geojsonLoadTimer.record(elapsed, TimeUnit.NANOSECONDS);
        }
    }

    @Cacheable(CacheConfig.CACHE_COLORS)
    public Map<Long, String> getAllColors() {
        List<TerritoryColor> allColors = colorRepository.findAll();
        Map<Long, String> colorMap = allColors.stream()
                .collect(Collectors.toMap(TerritoryColor::getTerritoryNumber, TerritoryColor::getColor));

        List<Long> numbers = territoryRepository.findDistinctTerritorioPadres();
        Map<Long, String> colors = new LinkedHashMap<>();
        for (int i = 0; i < numbers.size(); i++) {
            Long num = numbers.get(i);
            colors.put(num, colorMap.getOrDefault(num, PALETTE[i % PALETTE.length]));
        }
        return colors;
    }

    /**
     * Persists a color assignment and invalidates every derived cache so the
     * change is visible immediately to the frontend (admin panel flow).
     */
    @Transactional
    @Caching(evict = {
        @CacheEvict(value = CacheConfig.CACHE_COLORS, allEntries = true),
        @CacheEvict(value = CacheConfig.CACHE_GEOJSON_ALL, allEntries = true),
        @CacheEvict(value = CacheConfig.CACHE_GEOJSON_ONE, key = "#territoryNumber")
    })
    public void assignColor(Long territoryNumber, String color) {
        TerritoryColor tc = colorRepository.findById(territoryNumber)
                .orElse(new TerritoryColor());
        tc.setTerritoryNumber(territoryNumber);
        tc.setColor(color);
        colorRepository.save(tc);
    }

    private String getColorForTerritory(Long number) {
        TerritoryColor tc = colorRepository.findById(number).orElse(null);
        if (tc != null) return tc.getColor();
        List<Long> numbers = self().getTerritoryNumbers();
        int idx = numbers.indexOf(number);
        return PALETTE[Math.max(0, idx) % PALETTE.length];
    }
}
