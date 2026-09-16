package com.predicador.territory.tile;

import java.util.Objects;

/**
 * Entrada caché de un tile MVT. Almacena tanto el ETag (para la
 * cabecera HTTP condicional) como el cuerpo comprimido (gzip).
 *
 * @param etag        ETag fuerte: {@code "tile-{z}-{x}-{y}-v{data_version}"}
 * @param gzippedPbf  cuerpo PBF comprimido con gzip
 */
public record TileEntry(String etag, byte[] gzippedPbf) {

    public TileEntry {
        Objects.requireNonNull(etag, "etag no puede ser null");
        Objects.requireNonNull(gzippedPbf, "gzippedPbf no puede ser null");
    }
}