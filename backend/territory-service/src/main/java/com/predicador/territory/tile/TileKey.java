package com.predicador.territory.tile;

/**
 * Clave de la caché Caffeine de tiles. Incorpora {@code dataVersion} para que
 * un bump de datos deje huérfanas las entradas viejas (nunca se sirve dato
 * viejo con ETag nuevo) sin invalidación destructiva multi-instancia.
 *
 * @param z           zoom xyz
 * @param x           columna xyz
 * @param y           fila xyz
 * @param dataVersion versión de datos leída de {@code app_meta}
 */
public record TileKey(int z, int x, int y, long dataVersion) {

    public TileKey {
        if (z < 0) {
            throw new IllegalArgumentException("z debe ser >= 0, recibido: " + z);
        }
        if (x < 0 || y < 0) {
            throw new IllegalArgumentException("x/y deben ser >= 0, recibidos: " + x + "/" + y);
        }
    }

    /**
     * ETag fuerte de la entrada: {@code "tile-{z}-{x}-{y}-v{dataVersion}"}.
     */
    public String etag() {
        return "\"tile-" + z + "-" + x + "-" + y + "-v" + dataVersion + "\"";
    }
}