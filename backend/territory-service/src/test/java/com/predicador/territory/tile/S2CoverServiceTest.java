package com.predicador.territory.tile;

import com.google.common.geometry.S2CellId;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Envelope;

import java.time.Duration;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cobertura S2 a nivel fijo 14 (SPEC §6.2).
 *
 * <p>La propiedad clave: a nivel fijo las celdas particionan la esfera, por
 * lo que si {@code bbox_feature ∩ tile_rect ≠ ∅} entonces
 * {@code cover(bbox_feature) ∩ cover(tile_rect) ≠ ∅} — es decir, sin falsos
 * negativos en el lookup por btree ({@code s2_cell_id}).</p>
 */
class S2CoverServiceTest {

    private static final TileProperties PROPS =
            new TileProperties(19, 14, 12, 4096, 64, 100, Duration.ofMinutes(10));
    private final S2CoverService service = new S2CoverService(PROPS, new SimpleMeterRegistry());

    // ---- determinismo ---------------------------------------------------

    @Test
    void coverOfBBox_isDeterministic() {
        List<Long> a = service.coverOfBBox(-70.66, -33.46, -70.64, -33.44);
        List<Long> b = service.coverOfBBox(-70.66, -33.46, -70.64, -33.44);
        assertThat(a).isEqualTo(b).isNotEmpty();
    }

    @Test
    void coverOfBBox_isStableAcrossInstances() {
        List<Long> a = service.coverOfBBox(-70.66, -33.46, -70.64, -33.44);
        List<Long> b = new S2CoverService(PROPS, new SimpleMeterRegistry()).coverOfBBox(-70.66, -33.46, -70.64, -33.44);
        assertThat(a).isEqualTo(b);
    }

    // ---- safety de 256 celdas -------------------------------------------

    @Test
    void coverOfTile_smallTile_returnsNonEmptyAndUnderMaxCells() {
        // z14 tile conteniendo (~-70.65, -33.45) — tamaño ~0.02° (~2 km).
        // Con level-14 cells de ~240 m en esta latitud, esperamos ~8×8 = 64
        // celdas, bien por debajo del safety de 256.
        List<Long> cells = service.coverOfTile(14, 4976, 9809);
        assertThat(cells).isNotEmpty();
        assertThat(cells).hasSizeLessThanOrEqualTo(S2CoverService.MAX_TILE_CELLS);
    }

    @Test
    void coverOfTile_worldExceedsMaxCells_returnsEmptyForGiStFallback() {
        // El whole-world rect a nivel 14 necesita miles de celdas → vacío
        // para que el TileService caiga a la ruta GiST (bbox directo).
        assertThat(service.coverOfTile(0, 0, 0)).isEmpty();
    }

    @Test
    void coverOfBBox_pointBbox_returnsAtLeastOneCell() {
        List<Long> cells = service.coverOfBBox(-70.65, -33.45, -70.65, -33.45);
        assertThat(cells).hasSize(1);
    }

    @Test
    void coverOfBBox_nonFiniteCoordinates_returnsEmpty() {
        assertThat(service.coverOfBBox(Double.NaN, -33.46, -70.64, -33.44)).isEmpty();
        assertThat(service.coverOfBBox(-70.66, Double.NEGATIVE_INFINITY, -70.64, -33.44)).isEmpty();
    }

    // ---- propiedad superset (SPEC §6.2) ---------------------------------
    //
    // A nivel fijo (minLevel == maxLevel == 14) el coverer de S2 devuelve
    // el conjunto EXACTO de celdas que intersectan la región.  Por tanto, si
    // la región de feature y la región de tile comparten algún punto, al
    // menos una celda de nivel 14 contiene ese punto y aparecerá en ambas
    // coberturas.
    //
    // N=500 rectángulos aleatorios en Chile central (~-73.5:-69, -38:-32).

    @Test
    void coverIsSuperset_noFalseNegatives() {
        Random rnd = new Random(42);
        int propertySatisfactions = 0;

        for (int i = 0; i < 500; i++) {
            // ---- tile bbox: rect con spanT ∈ [0.02, 0.05) ----
            double lonT = -73.5 + rnd.nextDouble() * 4.5;        // [-73.5, -69.0)
            double latT = -38.0 + rnd.nextDouble() * 6.0;        // [-38.0, -32.0)
            double spanT = 0.02 + rnd.nextDouble() * 0.03;
            double minLonT = lonT, maxLonT = lonT + spanT;
            double minLatT = latT, maxLatT = latT + spanT;

            // ---- feature bbox: spanF ∈ [0.001, 0.010) ----
            // Siempre spanF < spanT (≥ 0.01 de margen) → el caso "contenido"
            // admite un feature con interior estrictamente dentro del tile.
            double spanF = 0.001 + rnd.nextDouble() * 0.009;

            double minLonF, maxLonF, minLatF, maxLatF;
            if ((i & 1) == 0) {
                // Par: feature anidado dentro del tile → intersección garantizada.
                double lonF = minLonT + rnd.nextDouble() * (spanT - spanF);
                double latF = minLatT + rnd.nextDouble() * (spanT - spanF);
                minLonF = lonF; maxLonF = lonF + spanF;
                minLatF = latF; maxLatF = latF + spanF;
            } else {
                // Impar: feature desplazado lejos al este del tile → disjunto.
                minLonF = maxLonT + 0.05; maxLonF = minLonF + spanF;
                minLatF = latT; maxLatF = latT + spanF;
            }

            boolean rectsIntersect =
                    intervalsIntersect(minLonF, maxLonF, minLonT, maxLonT)
                            && intervalsIntersect(minLatF, maxLatF, minLatT, maxLatT);

            List<Long> featureCells = service.coverOfBBox(minLonF, minLatF, maxLonF, maxLatF);
            List<Long> tileCells    = service.coverOfBBox(minLonT, minLatT, maxLonT, maxLatT);

            assertThat(featureCells).as("cover de feature no vacío (iter %d)", i).isNotEmpty();
            assertThat(tileCells).as("cover de tile no vacío (iter %d)", i).isNotEmpty();

            Set<Long> intersection = new HashSet<>(featureCells);
            intersection.retainAll(tileCells);

            if (rectsIntersect) {
                // IMPLICACIÓN: rects intersectan ⇒ covers intersectan
                assertThat(intersection)
                        .as("cover de feature %d debe intersectar cover de tile que toca", i)
                        .isNotEmpty();
                propertySatisfactions++;
            }
            // Cuando rects son disjoint: covers PUEDEN intersectar
            // (celdas vecinas en el borde) — no verificamos el contrapositivo.
        }

        // Verificación meta: el generador alterna par/impar, así que ~250 de
        // los 500 pares tienen intersección real (sanity check del generador).
        assertThat(propertySatisfactions).isGreaterThanOrEqualTo(200);
    }

    // ---- anti-meridiano (fix del dictamen) ------------------------------

    @Test
    void coverOfBBox_crossingAntimeridian_returnsNonEmptyFixedLevelCells() {
        // Feature cuyo bbox cruza ±180: se parte en [179.95,180] ∪
        // [-180,-179.95] y el cover de cada pieza se une — nunca vacío.
        List<Long> cells = service.coverOfBBox(179.95, -33.46, -179.95, -33.44);
        assertThat(cells).isNotEmpty();
        for (Long id : cells) {
            assertThat(new S2CellId(id).level()).isEqualTo(14);
        }

        // El mismo rect expresado como longitud "envuelta" (> 180) produce
        // exactamente el mismo cover (normalización a [-180,180]).
        List<Long> wrapped = service.coverOfBBox(179.95, -33.46, 180.05, -33.44);
        assertThat(wrapped).isEqualTo(cells);
    }

    @Test
    void coverOfTile_crossingAntimeridian_isSupersetOfFeatureCover() {
        // Tile z14 columna 16383 pegado al anti-meridiano: el query env
        // expandido por el buffer cruza ±180 ([179.9777, 180.0003]) y la
        // cobertura S2 se parte en dos piezas unidas.
        List<Long> tileCells = service.coverOfTile(14, 16383, 9809,
                new Envelope(179.9777, 180.0003, -33.46, -33.43));
        assertThat(tileCells).isNotEmpty();
        assertThat(tileCells).hasSizeLessThanOrEqualTo(S2CoverService.MAX_TILE_CELLS);

        // Feature dentro del tile (lado este del meridiano): partición a
        // nivel fijo ⇒ sus celdas intersectan el cover del tile.
        List<Long> featureCells = service.coverOfBBox(179.9785, -33.455, 179.9795, -33.445);
        Set<Long> intersection = new HashSet<>(featureCells);
        intersection.retainAll(tileCells);
        assertThat(intersection).isNotEmpty();
    }

    private static boolean intervalsIntersect(double aMin, double aMax, double bMin, double bMax) {
        return aMin <= bMax && bMin <= aMax;
    }
}