package com.predicador.territory.tile;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Configuración del pipeline MVT (bloque {@code app.tiles} en
 * config-server). Constructor binding con validación explícita: valores
 * fuera de rango fallan al arrancar con un mensaje claro en vez de
 * degenerar en tiles rotos en runtime.
 *
 * @param maxZoom               zoom máximo servible (z en [0, maxZoom])
 * @param s2Level               nivel S2 fijo global (features + rects de tile)
 * @param s2ZMin                primer zoom que usa la ruta S2 (z menores → capa disuelta por GiST)
 * @param extent                extent MVT (4096 por spec 2.1)
 * @param buffer                buffer de clip en px de tile (64)
 * @param cacheMaxSize          entradas máximas de la caché Caffeine de tiles
 * @param cacheTtl              TTL de la caché Caffeine de tiles
 * @param writeListenerPoolSize tamaño del thread pool para el listener
 *                              asíncrono de escritura (F2)
 */
@ConfigurationProperties(prefix = "app.tiles")
public record TileProperties(
        int maxZoom,
        int s2Level,
        int s2ZMin,
        int extent,
        int buffer,
        long cacheMaxSize,
        Duration cacheTtl,
        int writeListenerPoolSize) {

    public TileProperties {
        if (maxZoom < 0 || maxZoom > 30) {
            throw new IllegalArgumentException("app.tiles.max-zoom debe estar en [0, 30], recibido: " + maxZoom);
        }
        if (s2Level < 0 || s2Level > 30) {
            throw new IllegalArgumentException("app.tiles.s2-level debe estar en [0, 30], recibido: " + s2Level);
        }
        if (s2ZMin < 0) {
            throw new IllegalArgumentException("app.tiles.s2-z-min debe ser >= 0, recibido: " + s2ZMin);
        }
        if (extent <= 0) {
            throw new IllegalArgumentException("app.tiles.extent debe ser > 0, recibido: " + extent);
        }
        if (buffer < 0) {
            throw new IllegalArgumentException("app.tiles.buffer debe ser >= 0, recibido: " + buffer);
        }
        if (cacheMaxSize <= 0) {
            throw new IllegalArgumentException("app.tiles.cache-max-size debe ser > 0, recibido: " + cacheMaxSize);
        }
        if (cacheTtl == null || cacheTtl.isNegative() || cacheTtl.isZero()) {
            throw new IllegalArgumentException("app.tiles.cache-ttl debe ser positivo, recibido: " + cacheTtl);
        }
        if (writeListenerPoolSize <= 0) {
            throw new IllegalArgumentException("app.tiles.write-listener-pool-size debe ser > 0, recibido: " + writeListenerPoolSize);
        }
    }
}