package com.predicador.territory.tile;

import java.util.Set;

/**
 * Domain event published inside a {@code @Transactional} mutator when data
 * that affects tiles changes.
 *
 * <p>The event is picked up by {@link TileWriteService} via
 * {@code @EventListener(phase = AFTER_COMMIT)}, which bumps
 * {@code data_version} and optionally recomputes S2 covers or the
 * dissolved layer — never in the committing transaction.</p>
 *
 * <p>Published as a Spring {@link org.springframework.context.ApplicationEvent}
 * so that {@code @TransactionalEventListener} semantics apply.</p>
 *
 * @param manzanaIds        ids de manzanas cuya geometría cambió
 *                          (vacío para solo bump de versión)
 * @param territorioPadre   territorio padre afectado (nullable)
 * @param recomputeCovers   si {@code true}, reindex S2 de las manzanas
 * @param refreshDissolved  si {@code true} y {@code territorioPadre} no es
 *                          null, reconstruye el polígono disuelto del
 *                          territorio
 */
public record DataChangedEvent(
        Set<Long> manzanaIds,
        Long territorioPadre,
        boolean recomputeCovers,
        boolean refreshDissolved) {
}
