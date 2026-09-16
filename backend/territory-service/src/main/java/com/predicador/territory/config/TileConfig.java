package com.predicador.territory.config;

import com.predicador.territory.tile.TileProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Configuration de los beans del pipeline MVT (F1 + F2).
 *
 * <p>{@link TileProperties} (bloque {@code app.tiles} servido por el
 * config-server) usa constructor binding y se habilita explícitamente aquí;
 * el resto de beans del pipeline ({@code TileService}, {@code S2CoverService},
 * {@code S2BackfillService}, {@code TileWriteService}, ...) son
 * {@code @Service} con anotaciones estándar y los detecta el component scan
 * de {@code TerritoryServiceApp}.</p>
 *
 * <p>El bean {@code tilesWritePool} provee el thread pool dedicado para
 * {@code @Async} del listener de escritura (F2).</p>
 */
@Configuration
@EnableAsync
@EnableConfigurationProperties(TileProperties.class)
public class TileConfig {

    /**
     * Thread pool dedicado para el listener asíncrono de escritura
     * ({@link com.predicador.territory.tile.TileWriteService}).
     *
     * <p>Pool pequeño (configurable, default 2) y no bloqueante: el
     * listener ejecuta bumps de versión y reindexación S2/dislolves
     * después del commit. Si el pool está saturado, las tareas se
     * encolan — no bloquean la transacción del request.</p>
     */
    @Bean("tilesWritePool")
    public Executor tilesWritePool(TileProperties props) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(props.writeListenerPoolSize());
        executor.setMaxPoolSize(props.writeListenerPoolSize());
        executor.setQueueCapacity(64);
        executor.setThreadNamePrefix("tiles-write-");
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.setBeanName("tilesWritePool");
        return executor;
    }
}