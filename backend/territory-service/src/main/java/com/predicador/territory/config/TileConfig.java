package com.predicador.territory.config;

import com.predicador.territory.tile.TileProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration de los beans del pipeline MVT (F1).
 *
 * <p>{@link TileProperties} (bloque {@code app.tiles} servido por el
 * config-server) usa constructor binding y se habilita explícitamente aquí;
 * el resto de beans del pipeline ({@code TileService}, {@code S2CoverService},
 * {@code S2BackfillService}, ...) son {@code @Service} con anotaciones estándar
 * y los detecta el component scan de {@code TerritoryServiceApp}.</p>
 */
@Configuration
@EnableConfigurationProperties(TileProperties.class)
public class TileConfig {
}