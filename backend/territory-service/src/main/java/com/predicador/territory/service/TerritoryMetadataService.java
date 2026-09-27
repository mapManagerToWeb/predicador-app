package com.predicador.territory.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.predicador.territory.dto.TerritoryMetadataDto;
import com.predicador.territory.repository.TerritoryRepository;
import com.predicador.territory.tile.DataVersionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Lightweight per-territory metadata for {@code GET /territories/metadata}
 * (D2 del cambio f5): identidad, color, bounds, centro representativo,
 * conteo de manzanas y fids — sin geometría.
 *
 * <p><b>Caché en memoria claveada por {@code app_meta.data_version}</b>
 * (vía {@link DataVersionService}, el mismo mecanismo que usan los tiles y
 * el TileJSON): la respuesta cacheada se sirve mientras la versión no
 * cambie; cuando el write path (F2) bumpe la versión, la siguiente llamada
 * recalcula. La caché es un par inmutable en un campo {@code volatile} —
 * una carrera perdida solo implica recalcular dos veces, nunca servir una
 * versión vieja junto a una nueva.</p>
 */
@Service
public class TerritoryMetadataService {

    private static final Logger log = LoggerFactory.getLogger(TerritoryMetadataService.class);
    private static final TypeReference<List<Long>> FIDS_TYPE = new TypeReference<>() {};

    private final TerritoryRepository territoryRepository;
    private final TerritoryService territoryService;
    private final DataVersionService dataVersionService;
    private final ObjectMapper objectMapper;

    /** Entrada cacheada: versión de datos + payload inmutable. */
    private record CacheEntry(long dataVersion, List<TerritoryMetadataDto> payload) {}

    private volatile CacheEntry cache;

    public TerritoryMetadataService(TerritoryRepository territoryRepository,
                                    TerritoryService territoryService,
                                    DataVersionService dataVersionService,
                                    ObjectMapper objectMapper) {
        this.territoryRepository = territoryRepository;
        this.territoryService = territoryService;
        this.dataVersionService = dataVersionService;
        this.objectMapper = objectMapper;
    }

    /**
     * Metadatos de todos los territorios, ordenados por número.
     *
     * <p>Sirve la respuesta cacheada mientras {@code data_version} no
     * cambie; si cambia, recalcula y reemplaza la entrada.</p>
     */
    public List<TerritoryMetadataDto> getMetadata() {
        long version = dataVersionService.current();
        CacheEntry entry = cache;
        if (entry != null && entry.dataVersion() == version) {
            return entry.payload();
        }
        List<TerritoryMetadataDto> payload = compute();
        cache = new CacheEntry(version, payload);
        return payload;
    }

    private List<TerritoryMetadataDto> compute() {
        List<TerritoryRepository.TerritoryMetadataRow> rows = territoryRepository.findTerritoryMetadata();
        if (rows.isEmpty()) {
            return List.of();
        }
        // Reutiliza el mismo mapa de colores (asignados + fallback de
        // paleta) que sirve GET /colors — paridad exacta con los tiles.
        Map<Long, String> colors = territoryService.getAllColors();

        List<TerritoryMetadataDto> result = new ArrayList<>(rows.size());
        for (TerritoryRepository.TerritoryMetadataRow row : rows) {
            Long numero = row.getNumero();
            result.add(new TerritoryMetadataDto(
                    numero,
                    "Territorio " + numero,
                    colors.getOrDefault(numero, ""),
                    toBounds(row),
                    toCenter(row),
                    row.getManzanaCount() != null ? row.getManzanaCount() : 0L,
                    parseFids(row.getFids())));
        }
        return List.copyOf(result);
    }

    private static List<Double> toBounds(TerritoryRepository.TerritoryMetadataRow row) {
        if (row.getMinLng() == null || row.getMinLat() == null
                || row.getMaxLng() == null || row.getMaxLat() == null) {
            return null;
        }
        return List.of(row.getMinLng(), row.getMinLat(), row.getMaxLng(), row.getMaxLat());
    }

    private static List<Double> toCenter(TerritoryRepository.TerritoryMetadataRow row) {
        if (row.getCenterLng() == null || row.getCenterLat() == null) {
            return null;
        }
        return List.of(row.getCenterLng(), row.getCenterLat());
    }

    /**
     * Parsea el JSON de fids ({@code json_agg}) a {@code List<Long>}.
     *
     * <p>Un JSON malformado indicaría corrupción interna de la query; se
     * envuelve en {@link IllegalStateException} para que el
     * {@code GlobalExceptionHandler} existente lo registre y devuelva un
     * 500 genérico sin filtrar detalles internos.</p>
     */
    private List<Long> parseFids(String fidsJson) {
        try {
            List<Long> fids = objectMapper.readValue(fidsJson, FIDS_TYPE);
            return List.copyOf(fids);
        } catch (JsonProcessingException e) {
            log.error("JSON de fids inválido en metadata de territorios", e);
            throw new IllegalStateException("Metadatos de territorios corruptos", e);
        }
    }
}
