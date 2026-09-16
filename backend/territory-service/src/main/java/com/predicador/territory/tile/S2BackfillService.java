package com.predicador.territory.tile;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.WKBReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * Backfill idempotente del pipeline S2 al arranque (SPEC §6.4).
 *
 * <p>Se ejecuta una sola vez por despliegue: si {@code app_meta.k =
 * 's2_backfill_done'} existe, no hace nada. Si no existe:
 *
 * <ol>
 *   <li>Reanuda desde {@code MAX(manzana_id)} de {@code manzana_s2_cover}
 *       (o 0) en lotes de {@value #BATCH_SIZE} manzanas; cada lote inserta
 *       sus covers en una transacción propia con {@code ON CONFLICT DO
 *       NOTHING} → idempotente y reanudable ante cortes.</li>
 *   <li>Reconstruye {@code territorio_disuelto} (ST_Union por territorio,
 *       {@code ST_CollectionExtract(..., 3)} protege contra
 *       GEOMETRYCOLLECTION, con {@code ON CONFLICT DO UPDATE} para
 *       idempotencia).</li>
 *   <li>Marca {@code ('s2_backfill_done', 1)}.</li>
 * </ol>
 *
 * <p>Geometrías inválidas (WKB ilegible, vacías, bbox no finito): skip +
 * log + contador Micrometer — nunca abortan el lote. Las manzanas con
 * {@code geometry IS NULL} se excluyen en SQL. Progreso por Micrometer
 * ({@code territory.tile.backfill.processed}) y log estructurado.</p>
 */
@Service
public class S2BackfillService implements ApplicationRunner {

    static final int BATCH_SIZE = 5000;
    private static final String DONE_KEY = "s2_backfill_done";

    private static final Logger log = LoggerFactory.getLogger(S2BackfillService.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final S2CoverService s2Cover;
    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final WKBReader wkbReader;
    private final Counter processed;

    public S2BackfillService(JdbcTemplate jdbc, PlatformTransactionManager txManager,
                             S2CoverService s2Cover, MeterRegistry registry) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(txManager);
        this.s2Cover = s2Cover;
        this.wkbReader = new WKBReader(geometryFactory);
        this.processed = Counter.builder("territory.tile.backfill.processed")
                .description("Manzanas con cover S2 insertadas por el backfill")
                .register(registry);
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            runBackfill();
        } catch (RuntimeException ex) {
            // No tumbamos el arranque: el guard sigue ausente y el próximo
            // reinicio reanuda el backfill (idempotente). El pipeline
            // existente (/all/geojson) sigue sirviendo.
            log.error("S2 backfill falló; se reintentará en el próximo arranque (guard s2_backfill_done ausente)", ex);
        }
    }

    /**
     * Ejecuta el backfill completo. Público para tests de integración;
     * idempotente por diseño.
     */
    public void runBackfill() {
        Boolean done = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM app_meta WHERE k = ?)", Boolean.class, DONE_KEY);
        if (Boolean.TRUE.equals(done)) {
            log.info("S2 backfill: guard '{}' presente, nada que hacer", DONE_KEY);
            return;
        }

        backfillCovers();
        rebuildDissolved();
        tx.executeWithoutResult(status ->
                jdbc.update("INSERT INTO app_meta (k, v) VALUES (?, 1) ON CONFLICT (k) DO NOTHING", DONE_KEY));
        log.info("S2 backfill completado: covers + disueltos + guard '{}'", DONE_KEY);
    }

    private void backfillCovers() {
        long lastId = jdbc.queryForObject(
                "SELECT COALESCE(MAX(manzana_id), 0) FROM manzana_s2_cover", Long.class);

        long processedTotal = 0;
        while (true) {
            // Un lote: filas con id > lastId, ordenadas. Límite estricto de
            // memoria (WKB por manzana es pequeño).
            List<BatchRow> batch = jdbc.query(
                    "SELECT id, ST_AsBinary(ST_Force2D(geometry)) AS geom "
                            + "FROM manzanas_territorio "
                            + "WHERE id > ? AND geometry IS NOT NULL "
                            + "ORDER BY id LIMIT ?",
                    (rs, rowNum) -> new BatchRow(rs.getLong("id"), rs.getBytes("geom")),
                    lastId, BATCH_SIZE);
            if (batch.isEmpty()) {
                break;
            }

            long covered = insertCovers(batch);
            lastId = batch.get(batch.size() - 1).id();
            processedTotal += covered;
            processed.increment(covered);
            log.info("S2 backfill: {} manzanas con cover (lote hasta id {}, {} omitidas)",
                    processedTotal, lastId, batch.size() - covered);
        }
    }

    /**
     * Inserta los covers S2 de un lote de manzanas. Devuelve el número de
     * manzanas realmente cubiertas (con al menos una celda insertada) para
     * que el contador {@code territory.tile.backfill.processed} refleje solo
     * manzanas procesadas, no filas del lote.
     */
    private long insertCovers(List<BatchRow> batch) {
        List<Object[]> args = new ArrayList<>();
        long covered = 0;
        long skipped = 0;
        for (BatchRow row : batch) {
            try {
                Geometry geom = wkbReader.read(row.geom());
                if (geom == null || geom.isEmpty()) {
                    skipped++;
                    continue;
                }
                Envelope bbox = geom.getEnvelopeInternal();
                List<Long> cells = s2Cover.coverOfBBox(
                        bbox.getMinX(), bbox.getMinY(), bbox.getMaxX(), bbox.getMaxY());
                if (cells.isEmpty()) {
                    // Cover vacío por overflow del cap de features (o bbox
                    // degenerado): la manzana NO se indexa — cuenta como
                    // omitida (no procesada), nunca como cubierta.
                    skipped++;
                    log.warn("S2 backfill: manzana {} omitida (cover S2 vacío "
                                    + "— cap de {} celdas excedido)",
                            row.id(), S2CoverService.MAX_FEATURE_CELLS);
                    continue;
                }
                covered++;
                for (Long cell : cells) {
                    args.add(new Object[]{row.id(), cell});
                }
            } catch (Exception ex) {
                skipped++;
                log.warn("S2 backfill: manzana {} omitida (geometría inválida): {}", row.id(), ex.getMessage());
            }
        }
        if (skipped > 0) {
            log.warn("S2 backfill: {} manzanas omitidas del lote (geom. inválida/nula o cover S2 vacío)", skipped);
        }

        List<Object[]> batchArgs = args;
        tx.executeWithoutResult(status -> {
            if (!batchArgs.isEmpty()) {
                jdbc.batchUpdate(
                        "INSERT INTO manzana_s2_cover (manzana_id, s2_cell_id) VALUES (?, ?) "
                                + "ON CONFLICT DO NOTHING",
                        batchArgs,
                        Math.min(BATCH_SIZE, batchArgs.size()),
                        (ps, arg) -> {
                            ps.setLong(1, (Long) arg[0]);
                            ps.setLong(2, (Long) arg[1]);
                        });
            }
        });
        return covered;
    }

    private void rebuildDissolved() {
        int rows = tx.execute(status -> jdbc.update("""
                INSERT INTO territorio_disuelto (territorio_padre, geometry, total_manzanas)
                SELECT territorio_padre,
                       ST_Multi(ST_CollectionExtract(ST_Force2D(ST_Union(geometry)), 3)),
                       COUNT(*)
                FROM manzanas_territorio
                WHERE territorio_padre IS NOT NULL
                  AND geometry IS NOT NULL
                  AND ST_GeometryType(geometry) IN ('ST_Polygon', 'ST_MultiPolygon')
                GROUP BY territorio_padre
                ON CONFLICT (territorio_padre) DO UPDATE
                  SET geometry = EXCLUDED.geometry,
                      total_manzanas = EXCLUDED.total_manzanas
                """));
        log.info("S2 backfill: territorio_disuelto reconstruido ({} territorios)", rows);
    }

    /** Fila de un lote de backfill: id + WKB 2D 4326 ya forzada en SQL. */
    private record BatchRow(long id, byte[] geom) {
    }
}