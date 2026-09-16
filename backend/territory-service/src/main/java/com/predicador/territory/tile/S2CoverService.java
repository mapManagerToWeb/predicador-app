package com.predicador.territory.tile;

import com.google.common.geometry.S2CellId;
import com.google.common.geometry.S2CellUnion;
import com.google.common.geometry.S2LatLng;
import com.google.common.geometry.S2LatLngRect;
import com.google.common.geometry.S2RegionCoverer;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.locationtech.jts.geom.Envelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Cobertura Google S2 a nivel fijo ({@code app.tiles.s2-level}, 14).
 *
 * <p>A nivel fijo las celdas particionan la esfera, así que el cover de un
 * rect es <em>exactamente</em> el conjunto de celdas de ese nivel que lo
 * intersectan ({@code S2RegionCoverer} con {@code minLevel == maxLevel}
 * devuelve todas las celdas aunque superen {@code maxCells} — ver javadoc
 * del builder: "an arbitrary number of cells may be returned if minLevel()
 * is too high for the region"). Con el cover de cada feature (bbox) y el
 * cover de cada tile (rect) al mismo nivel se cumple:</p>
 *
 * <pre>feature ∩ tile ≠ ∅  ⇒  cover(bbox) ∩ cover(rect) ≠ ∅</pre>
 *
 * <p>→ el lookup por btree ({@code s2_cell_id}) no tiene falsos negativos y
 * {@code ST_Intersects} queda solo como filtro fino (SPEC §6.2).</p>
 *
 * <p>Caps separados por consumidor: el rect de un tile puede exigir miles de
 * celdas (tiles z12/z13 ecuatoriales) y su exceso es un fallback normal a
 * GiST (silencioso, {@link #MAX_TILE_CELLS}); el bbox de una feature jamás
 * debe acercarse a esa cifra — un cover vacío por overflow se registra con
 * warn + contador Micrometer ({@link #MAX_FEATURE_CELLS}) y la manzana no se
 * indexa en el backfill (el tile la sirve igual por GiST).</p>
 *
 * <p>Anti-meridiano: un rect cuyos bounds cruzan ±180° (tras normalizar a
 * [-180,180]) se parte en {@code [minLon, 180] ∪ [-180, maxLon]} y los
 * covers se unen — el coverer no representa rects envueltos como un solo
 * intervalo. La normalización también absorbe bounds que exceden ±180
 * (query env del tile expandido por el buffer).</p>
 *
 * <p>Thread-safe: {@link S2RegionCoverer} es inmutable tras el builder.</p>
 */
@Service
public class S2CoverService {

    private static final Logger log = LoggerFactory.getLogger(S2CoverService.class);

    /**
     * Safety del rect de tile: si el cover excede este número de celdas la
     * ruta S2 se abandona y el servicio cae a GiST (bbox) — un tile z12/z13
     * cerca del ecuador puede superarlo, y el GiST es correcto igualmente.
     * Fallback silencioso (log.debug): es una ruta normal, no una anomalía.
     */
    static final int MAX_TILE_CELLS = 256;

    /**
     * Cap de celdas del cover de una feature individual (manzana) en el
     * backfill. Una manzana real genera decenas de celdas; un rect gigante o
     * degenerado podría superar 4096 → cover vacío, contador Micrometer
     * ({@code territory.tile.s2.feature-cover-overflow}) + warn, y la manzana
     * se cuenta como omitida (no procesada) en el backfill.
     */
    static final int MAX_FEATURE_CELLS = 4096;

    /** Presupuesto de trabajo del coverer; a nivel fijo puede superarse. */
    private static final int MAX_CELLS = 64;

    private final S2RegionCoverer coverer;
    private final int level;
    private final Counter featureCoverOverflow;

    public S2CoverService(TileProperties props, MeterRegistry registry) {
        this.level = props.s2Level();
        this.coverer = S2RegionCoverer.builder()
                .setMinLevel(props.s2Level())
                .setMaxLevel(props.s2Level())
                .setMaxCells(MAX_CELLS)
                .build();
        this.featureCoverOverflow = Counter.builder("territory.tile.s2.feature-cover-overflow")
                .description("Manzanas cuyo cover S2 excede el cap de features (4096) y no se indexan")
                .register(registry);
    }

    /**
     * Cover de un bbox lon/lat en grados al nivel fijo configurado.
     *
     * @return ids de celda S2 ({@link S2CellId#id()}); vacío si las
     *         coordenadas no son finitas o la latitud viene invertida (skip +
     *         log, jamas interrumpir el pipeline por una geometría
     *         defectuosa) o si el cover excede {@link #MAX_FEATURE_CELLS}
     *         (contador + warn; solo cuenta overflows reales, no inputs
     *         degenerados). Nota: {@code minLon > maxLon} NO es degenerado —
     *         es la representación de un rect que cruza el anti-meridiano y
     *         {@code coverOfLonLat} lo parte.
     */
    public List<Long> coverOfBBox(double minLon, double minLat, double maxLon, double maxLat) {
        if (!Double.isFinite(minLon) || !Double.isFinite(minLat)
                || !Double.isFinite(maxLon) || !Double.isFinite(maxLat)) {
            log.warn("S2 coverOfBBox: coordenadas no finitas ({}, {}, {}, {}) -> cover vacío",
                    minLon, minLat, maxLon, maxLat);
            return List.of();
        }
        if (minLat > maxLat) {
            log.warn("S2 coverOfBBox: latitud invertida ({}, {}, {}, {}) -> cover vacío",
                    minLon, minLat, maxLon, maxLat);
            return List.of();
        }
        List<Long> cells = coverOfLonLat(minLon, minLat, maxLon, maxLat, MAX_FEATURE_CELLS);
        if (cells.isEmpty()) {
            featureCoverOverflow.increment();
            log.warn("S2 coverOfBBox: cover de feature ({}, {}, {}, {}) vacío "
                            + "(> {} celdas o rect degenerado) -> no indexada",
                    minLon, minLat, maxLon, maxLat, MAX_FEATURE_CELLS);
        }
        return cells;
    }

    /**
     * Cover del rect de un tile xyz al nivel fijo configurado (bounds crudos
     * del tile, sin buffer).
     *
     * @return ids de celda; si el cover excede {@link #MAX_TILE_CELLS}
     *         devuelve vacío para que el llamador caiga a GiST
     */
    public List<Long> coverOfTile(int z, int x, int y) {
        return coverOfTile(z, x, y, WebMercator.tileBoundsLonLat(z, x, y));
    }

    /**
     * Cover del rect de un tile con bounds ya expandidos por el buffer
     * (query env en lon/lat). Los bounds pueden exceder ±180° en tiles
     * pegados al anti-meridiano — se normalizan y, si cruzan, se parten.
     *
     * @return ids de celda; vacío si el cover excede {@link #MAX_TILE_CELLS}
     *         (→ el llamador cae a GiST, ruta normal)
     */
    public List<Long> coverOfTile(int z, int x, int y, Envelope bounds) {
        List<Long> cells = coverOfLonLat(
                bounds.getMinX(), bounds.getMinY(), bounds.getMaxX(), bounds.getMaxY(), MAX_TILE_CELLS);
        if (cells.isEmpty()) {
            log.debug("tile {}/{}/{}: cover vacío o > {} celdas, se cae a GiST",
                    z, x, y, MAX_TILE_CELLS);
        }
        return cells;
    }

    /**
     * Cover de un rect lon/lat arbitrario a nivel fijo con cap {@code maxCells}.
     *
     * <p>Anti-meridiano: longitudes normalizadas a [-180, 180]; si el rect
     * cruza ±180 (min &gt; 0 y max &lt; 0, o span &gt; 180°) se parte en
     * {@code [nMinLon, 180]} ∪ {@code [-180, nMaxLon]} y los covers se unen
     * deduplicando. El constructor explícito {@code S2LatLngRect(lo, hi)} se
     * usa en las piezas porque {@code fromPointPair} elegiría el intervalo
     * corto y rompería el split.</p>
     */
    private List<Long> coverOfLonLat(double minLon, double minLat, double maxLon, double maxLat, int maxCells) {
        double nMinLon = normalizeLon(minLon);
        double nMaxLon = normalizeLon(maxLon);

        boolean crossesAntimeridian = (nMinLon > 0 && nMaxLon < 0) || (nMaxLon - nMinLon) > 180.0;
        if (!crossesAntimeridian) {
            return coverOfRect(new S2LatLngRect(
                    S2LatLng.fromDegrees(minLat, nMinLon),
                    S2LatLng.fromDegrees(maxLat, nMaxLon)), maxCells);
        }

        // Pieza este [nMinLon, 180] y pieza oeste [-180, nMaxLon] — en cada
        // pieza lo ≤ hi por construcción, el rect representa el intervalo
        // exacto deseado.
        List<Long> east = coverOfRect(new S2LatLngRect(
                S2LatLng.fromDegrees(minLat, nMinLon),
                S2LatLng.fromDegrees(maxLat, 180.0)), maxCells);
        List<Long> west = coverOfRect(new S2LatLngRect(
                S2LatLng.fromDegrees(minLat, -180.0),
                S2LatLng.fromDegrees(maxLat, nMaxLon)), maxCells);
        if (east.isEmpty() || west.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<Long> merged = new LinkedHashSet<>(east.size() + west.size());
        merged.addAll(east);
        merged.addAll(west);
        if (merged.size() > maxCells) {
            return List.of();
        }
        return List.copyOf(merged);
    }

    /**
     * Normaliza una longitud a [-180, 180]: {@code lon % 360} con ajuste al
     * rango (preserva los extremos exactos ±180 tal cual; no usa floorMod).
     */
    static double normalizeLon(double lon) {
        double r = lon % 360.0;
        if (r > 180.0) {
            return r - 360.0;
        }
        if (r < -180.0) {
            return r + 360.0;
        }
        return r;
    }

    private List<Long> coverOfRect(S2LatLngRect rect, int maxCells) {
        // Pre-guard por área ANTES de invocar el coverer: con minLevel ==
        // maxLevel, S2RegionCoverer expande recursivamente las celdas
        // completamente contenidas hasta el nivel fijo SIN acotar ("an
        // arbitrary number of cells may be returned if minLevel is too high
        // for the region" — javadoc del builder). Un rect gigante (el mundo,
        // un tile z0/z1) explota el heap dentro de getCovering, antes de que
        // el conteo posterior pueda acotarlo. El nº de celdas de nivel fijo
        // es del orden de area(rect)/avgCellArea(level); multiplicamos por
        // 1.5 como estimación conservadora (la variación de área de celda es
        // ±~1.4× y hay celdas de borde — aproximación, no cota estricta) y si
        // excede maxCells devolvemos vacío sin tocar el coverer. El guard
        // post-conteo exacto sigue siendo el árbitro final para rects cerca
        // del cap.
        double avgCellArea = (4.0 * Math.PI) / (6.0 * (1L << (2 * level)));
        double estimatedCells = rect.area() / avgCellArea * 1.5;
        if (estimatedCells > maxCells) {
            return List.of();
        }

        // Normalized union (posiblemente contiene celdas por encima de level
        // — el budget branch de ActiveCovering las marca terminal para evitar
        // exploración infinita).  Denormalizamos manualmente al nivel fijo
        // configurado para producir ids exactos (igualdad en btree).
        //
        // Acotado: si el número de celdas a nivel fijo supera maxCells
        // devolvemos vacío → el caller decide (tile: GiST; feature: skip).
        // Consistente con los caps de coverOfTile/coverOfBBox.
        S2CellUnion union = coverer.getCovering(rect);

        long count = 0;
        for (S2CellId id : union) {
            int gap = level - id.level();
            count += (gap <= 0) ? 1 : (1L << (2 * gap));
            if (count > maxCells) {
                return List.of();
            }
        }

        ArrayList<Long> result = new ArrayList<>((int) count);
        for (S2CellId id : union) {
            if (id.level() == level) {
                result.add(id.id());
            } else if (id.level() < level) {
                S2CellId end = id.childEnd(level);
                for (S2CellId child = id.childBegin(level); !child.equals(end); child = child.next()) {
                    result.add(child.id());
                }
            }
            // id.level() > level: imposible con minLevel==maxLevel==level
        }
        return result;
    }
}