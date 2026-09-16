package com.predicador.territory.tile;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * Endpoints MVT (F1, read-only — el pipeline de datos actual queda intacto).
 *
 * <ul>
 *   <li>{@code GET /tiles/{z}/{x}/{y}.pbf} → tile MVT 2.1 (extent 4096,
 *       buffer 64, xyz). Siempre gzip, ETag fuerte condicional (304) y
 *       {@code Cache-Control: private, max-age=300}. Tile sin features →
 *       200 con MVT vacío válido (el cliente lo cachea, sin refetch).</li>
 *   <li>{@code GET /tiles.json} → TileJSON 3.0 con bounds cacheados.</li>
 * </ul>
 *
 * <p>Validación estricta de coordenadas en el controlador (guard clause):
 * {@code 0 ≤ z ≤ maxZoom}, {@code 0 ≤ x,y < 2^z} → 400. El ETag del tile se
 * gestiona aquí manualmente; el {@code ShallowEtagHeaderFilter} de
 * {@code CacheConfig} está excluido de estas rutas (de lo contrario
 * sobrescribiría el ETag versionado por {@code data_version}).</p>
 */
@RestController
@RequestMapping("/api/v1/territories")
public class TileController {

    /** Media type MVT del spec 4.2. */
    static final String MVT_MEDIA_TYPE = "application/vnd.mapbox-vector-tile";

    /** Alias aceptado por el spec 4.2. */
    private static final String X_PROTOBUF_MEDIA_TYPE = "application/x-protobuf";

    private static final CacheControl PRIVATE_5M =
            CacheControl.maxAge(Duration.ofSeconds(300)).cachePrivate();

    private final TileService tileService;
    private final TileJsonService tileJsonService;
    private final TileProperties props;

    public TileController(TileService tileService, TileJsonService tileJsonService, TileProperties props) {
        this.tileService = tileService;
        this.tileJsonService = tileJsonService;
        this.props = props;
    }

    @GetMapping(value = "/tiles/{z}/{x}/{y}.pbf", produces = {MVT_MEDIA_TYPE, X_PROTOBUF_MEDIA_TYPE})
    public ResponseEntity<byte[]> tile(
            @PathVariable int z,
            @PathVariable int x,
            @PathVariable int y,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        if (!validTile(z, x, y)) {
            return ResponseEntity.badRequest().build();
        }

        // El ETag ya incorpora data_version; If-None-Match con el mismo
        // ETag → 304 sin tocar el body (la caché Caffeine ni se consulta
        // el contenido, pero sí la clave — barato). El 304 reenvía el ETag
        // (RFC 9110 §15.4.5) para que el cliente lo conserve sin revalidar.
        // Se acepta también `*` (RFC 9110: `*` → 304 si la representación
        // existe, que es el caso tras validar el tile); no se soportan
        // comparaciones weak (`W/`) porque nuestro ETag es fuerte.
        TileEntry entry = tileService.render(z, x, y);
        if ("*".equals(ifNoneMatch) || entry.etag().equals(ifNoneMatch)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .header(HttpHeaders.ETAG, entry.etag())
                    .build();
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(MVT_MEDIA_TYPE))
                .header(HttpHeaders.CONTENT_ENCODING, "gzip")
                .header(HttpHeaders.VARY, HttpHeaders.ACCEPT_ENCODING)
                .eTag(entry.etag())
                .cacheControl(PRIVATE_5M)
                .body(entry.gzippedPbf());
    }

    @GetMapping(value = "/tiles.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<TileJson> tileJson() {
        return ResponseEntity.ok(tileJsonService.tileJson());
    }

    private boolean validTile(int z, int x, int y) {
        if (z < 0 || z > props.maxZoom()) {
            return false;
        }
        long n = 1L << z;
        return x >= 0 && x < n && y >= 0 && y < n;
    }
}