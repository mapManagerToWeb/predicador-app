package com.predicador.territory.tile;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Set;

/**
 * Listener transaccional que procesa {@link DataChangedEvent} después del
 * commit de la transacción que los publica.
 *
 * <p>Responsabilidades:</p>
 * <ol>
 *   <li><b>Siempre:</b> bump de {@code data_version} en {@code app_meta}
 *       (idempotente — {@code UPDATE SET v = v + 1}).</li>
 *   <li><b>Condicional:</b> reindex S2 de manzanas individuales
 *       ({@code recomputeCovers}).</li>
 *   <li><b>Condicional:</b> reconstrucción del polígono disuelto del
 *       territorio ({@code refreshDissolved}).</li>
 * </ol>
 *
 * <p>Ejecuta en thread pool dedicado ({@code @Async("tilesWritePool")}) para
 * no bloquear la transacción del request. Try/catch global: nunca relanza
 * — un bump fallido es recuperable (el siguiente write lo reintenta).</p>
 */
@Service
public class TileWriteService {

    private static final Logger log = LoggerFactory.getLogger(TileWriteService.class);

    private final DataVersionService dataVersionService;
    private final S2CoverService s2CoverService;
    private final TerritoryTileRepository tileRepository;
    private final Counter bumps;
    private final Counter bumpFailures;

    public TileWriteService(DataVersionService dataVersionService,
                            S2CoverService s2CoverService,
                            TerritoryTileRepository tileRepository,
                            MeterRegistry registry) {
        this.dataVersionService = dataVersionService;
        this.s2CoverService = s2CoverService;
        this.tileRepository = tileRepository;
        this.bumps = Counter.builder("territory.tile.version.bumps")
                .description("Version bumps completadas tras commit exitoso")
                .register(registry);
        this.bumpFailures = Counter.builder("territory.tile.version.bump-failures")
                .description("Fallo al bumpear data_version (recuperable, el siguiente write reintenta)")
                .register(registry);
    }

    /**
     * Procesa un evento de cambio de datos después del commit.
     *
     * <p>Ejecución asíncrona en el thread pool {@code tilesWritePool}.
     * Jamás relanza excepciones: un bump fallido se registra con warn +
     * counter Micrometer y el siguiente write lo reintenta.</p>
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Async("tilesWritePool")
    public void onDataChanged(DataChangedEvent event) {
        try {
            dataVersionService.bumpVersion();
            bumps.increment();
            log.debug("data_version bumped tras evento de escritura");

            if (event.recomputeCovers()) {
                recomputeCovers(event.manzanaIds());
            }
            if (event.refreshDissolved() && event.territorioPadre() != null) {
                refreshDissolved(event.territorioPadre());
            }
        } catch (Exception ex) {
            bumpFailures.increment();
            log.warn("Fallo al procesar DataChangedEvent (recuperable): {}", ex.getMessage(), ex);
        }
    }

    /**
     * Reindexa la cobertura S2 de las manzanas especificadas.
     *
     * <p>Por cada manzana: lee la geometría (WKT), calcula el bbox,
     * obtiene el cover S2 y reemplaza las entradas en
     * {@code manzana_s2_cover} ({@code DELETE + INSERT}).
     * Empaquetado con {@code @Transactional} para garantizar que el
     * DELETE + INSERT de cada manzana sea atómico (evita ventana de
     * inconsistencia donde concurrent reads ven cero covers).</p>
     */
    @Transactional
    void recomputeCovers(Set<Long> manzanaIds) {
        GeometryFactory gf = new GeometryFactory();
        WKTReader wktReader = new WKTReader(gf);

        for (Long manzanaId : manzanaIds) {
            try {
                TerritoryTileRepository.ManzanaGeometryRow row = tileRepository.findManzanaGeometryById(manzanaId);
                if (row == null) {
                    log.warn("recomputeCovers: manzana {} no encontrada, omitida", manzanaId);
                    continue;
                }

                Geometry geom = wktReader.read(row.geom());
                if (geom == null || geom.isEmpty()) {
                    log.warn("recomputeCovers: geometría vacía/inválida para manzana {}", manzanaId);
                    continue;
                }

                Envelope bbox = geom.getEnvelopeInternal();
                List<Long> cover = s2CoverService.coverOfBBox(
                        bbox.getMinX(), bbox.getMinY(),
                        bbox.getMaxX(), bbox.getMaxY());
                tileRepository.replaceS2Cover(manzanaId, cover);
            } catch (ParseException ex) {
                log.warn("recomputeCovers: WKT inválido para manzana {}: {}",
                        manzanaId, ex.getMessage());
            }
        }
    }

    /**
     * Reconstruye el polígono disuelto del territorio padre:
     * {@code DELETE + INSERT} en {@code territorio_disuelto} con
     * {@code ST_Union} de todas las manzanas del territorio.
     * Empaquetado con {@code @Transactional} para atomicidad.
     */
    @Transactional
    void refreshDissolved(Long territorioPadre) {
        tileRepository.refreshTerritorioDisuelto(territorioPadre);
        log.debug("territorio_disuelto refrescado para territorio {}", territorioPadre);
    }
}
