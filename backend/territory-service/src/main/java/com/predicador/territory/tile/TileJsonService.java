package com.predicador.territory.tile;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * TileJSON 3.0 del dataset de territorios.
 *
 * <p>Los {@code bounds} (extent de {@code territorio_disuelto} vía
 * {@code ST_Extent}) se cachean ~1h: son caros de calcular contra Neon
 * (aggregate espacial) y cambian solo cuando se añade/elimina territorio.
 * Si no hay territorios disueltos se devuelve el mundo completo.</p>
 */
@Service
public class TileJsonService {

    private static final String NAME = "territories";
    private static final String TILE_URL = "/api/v1/territories/tiles/{z}/{x}/{y}.pbf";
    private static final double[] WORLD_BOUNDS = {-180.0, -85.05112877980659, 180.0, 85.05112877980659};

    private final TerritoryTileRepository repo;
    private final TileProperties props;
    private final Cache<String, double[]> boundsCache;

    public TileJsonService(TerritoryTileRepository repo, TileProperties props) {
        this.repo = repo;
        this.props = props;
        this.boundsCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofHours(1))
                .maximumSize(1)
                .build();
    }

    public TileJson tileJson() {
        return new TileJson(
                "3.0.0",
                NAME,
                0,
                props.maxZoom(),
                bounds(),
                List.of(TILE_URL),
                List.of(
                        new TileJsonVectorLayer(
                                TileService.LAYER_MANZANA,
                                Map.of(
                                        "fid", "Number",
                                        "territorio", "Number",
                                        "bloque", "String",
                                        "color", "String"),
                                props.s2ZMin(),
                                props.maxZoom()),
                        new TileJsonVectorLayer(
                                TileService.LAYER_TERRITORIO,
                                Map.of(
                                        "tid", "Number",
                                        "color", "String",
                                        "nombre", "String",
                                        "total", "Number"),
                                0,
                                props.s2ZMin() - 1)));
    }

    private double[] bounds() {
        return boundsCache.get("bounds", key -> loadBounds());
    }

    private double[] loadBounds() {
        return repo.findExtent()
                .map(ext -> new double[]{
                        notNull(ext.getMinX()), notNull(ext.getMinY()),
                        notNull(ext.getMaxX()), notNull(ext.getMaxY())})
                .orElse(WORLD_BOUNDS);
    }

    private static double notNull(Double v) {
        return v != null ? v : 0.0;
    }
}