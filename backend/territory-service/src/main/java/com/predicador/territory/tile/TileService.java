package com.predicador.territory.tile;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.sebasbaumh.mapbox.vectortile.VectorTile;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.JtsAdapter;
import io.github.sebasbaumh.mapbox.vectortile.adapt.jts.UserDataKeyValueMapConverter;
import io.github.sebasbaumh.mapbox.vectortile.build.MvtLayerParams;
import io.github.sebasbaumh.mapbox.vectortile.build.MvtLayerProps;
import io.github.sebasbaumh.mapbox.vectortile.util.MvtUtil;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKBReader;
import org.locationtech.jts.simplify.TopologyPreservingSimplifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPOutputStream;

/**
 * Pipeline de render MVT (SPEC-map-vector-tiles.md §5.2).
 *
 * <p>Por cada {@code (z,x,y,dataVersion)} la clave de caché Caffeine
 * incorpora la versión de datos: un bump deja las entradas huérfanas y
 * nunca se sirve un ETag nuevo con body viejo.</p>
 *
 * <p>Rutas de lectura:</p>
 * <ul>
 *   <li>{@code z ≥ s2-z-min}: candidatos por btree S2 (nivel fijo 14) +
 *       {@code ST_Intersects} fino; si el cover del tile supera el safety
 *       de 256 celdas → fallback GiST (bbox).</li>
 *   <li>{@code z < 12}: capa {@code territorio} disuelta (pocas filas,
 *       envelope GiST).</li>
 * </ul>
 *
 * <p>Simplificación por zoom: {@code tol = 2px * worldWidth / (2^z *
 * extent)} en metros 3857 — la geometría se lee ya transformada a 3857.
 * El clip del encoder se expande con el buffer en px de tile.</p>
 */
@Service
public class TileService {

    /** Nombre de la capa MVT de manzanas (z ≥ 12). */
    public static final String LAYER_MANZANA = "manzana";

    /** Nombre de la capa MVT de territorios disueltos (z ≤ 11). */
    public static final String LAYER_TERRITORIO = "territorio";

    /** Color de fallback cuando {@code territory_settings} no tiene fila. */
    static final String DEFAULT_COLOR = "#94a3b8";

    private static final Logger log = LoggerFactory.getLogger(TileService.class);

    private final TerritoryTileRepository repo;
    private final S2CoverService s2Cover;
    private final DataVersionService versions;
    private final TerritoryColorResolver colorResolver;
    private final TileProperties props;
    private final GeometryFactory geometryFactory = new GeometryFactory();
    /**
     * {@link WKBReader} NO es thread-safe (javadoc oficial de JTS: "This
     * class is not thread-safe; each thread should create its own
     * instance"). Mantiene estado mutable de instancia (stream de lectura
     * {@code dis}, buffer {@code ordValues}, {@code inputDimension},
     * {@code maxNumFieldValue}) que se pisa si dos hilos del servidor
     * parsean a la vez — geometrías válidas omitidas de forma
     * no determinista ("WKB inválido" sobre bytes correctos). Un reader
     * por hilo elimina la carrera sin coste de asignación por fila.
     */
    private final ThreadLocal<WKBReader> wkbReader =
            ThreadLocal.withInitial(() -> new WKBReader(geometryFactory));
    private final Cache<TileKey, TileEntry> cache;

    private final Timer renderTimer;
    private final DistributionSummary tileSize;
    private final DistributionSummary s2Cells;
    private final Counter skippedGeometries;
    private final Counter routeS2;
    private final Counter routeGist;
    private final Counter routeDissolved;

    public TileService(TerritoryTileRepository repo, S2CoverService s2Cover,
                       DataVersionService versions, TerritoryColorResolver colorResolver,
                       TileProperties props, MeterRegistry registry) {
        this.repo = repo;
        this.s2Cover = s2Cover;
        this.versions = versions;
        this.colorResolver = colorResolver;
        this.props = props;
        this.cache = Caffeine.newBuilder()
                .maximumSize(props.cacheMaxSize())
                .expireAfterWrite(props.cacheTtl())
                .recordStats()
                .build();

        this.renderTimer = Timer.builder("territory.tile.render.duration")
                .description("Tiempo de render de un tile MVT (cache miss)")
                .publishPercentiles(0.5, 0.95)
                .register(registry);
        this.tileSize = DistributionSummary.builder("territory.tile.size")
                .description("Tamaño gzip del PBF servido (bytes)")
                .register(registry);
        this.s2Cells = DistributionSummary.builder("territory.tile.s2.cells")
                .description("Celdas S2 del cover de tile usado en la ruta S2")
                .register(registry);
        this.skippedGeometries = Counter.builder("territory.tile.skipped")
                .description("Geometrías inválidas omitidas al renderizar tiles")
                .register(registry);
        this.routeS2 = Counter.builder("territory.tile.route")
                .tag("route", "s2")
                .description("Tiles renderizados vía ruta S2 (z≥12, cover btree + filtro fino)")
                .register(registry);
        this.routeGist = Counter.builder("territory.tile.route")
                .tag("route", "gist")
                .description("Tiles renderizados vía ruta GiST (z≥12: fallback cover>cap)")
                .register(registry);
        this.routeDissolved = Counter.builder("territory.tile.route")
                .tag("route", "dissolved")
                .description("Tiles renderizados vía capa disuelta territorio_disuelto (z<12)")
                .register(registry);

        Gauge.builder("territory.tile.cache.size", cache, Cache::estimatedSize)
                .description("Entradas de la caché Caffeine de tiles")
                .register(registry);
        Gauge.builder("territory.tile.cache.hitRate", cache, c -> c.stats().hitRate())
                .description("Hit-rate de la caché Caffeine de tiles")
                .register(registry);
    }

    /**
     * Render (o lectura de caché) del tile {@code (z,x,y)} con la versión
     * de datos vigente. {@code z/x/y} deben estar ya validados por el
     * controlador (guard clause).
     */
    public TileEntry render(int z, int x, int y) {
        long version = versions.current();
        return cache.get(new TileKey(z, x, y, version), key -> buildTile(z, x, y, version));
    }

    /**
     * Invalida todas las entradas de la caché de tiles. Visible para tests
     * de integración que necesitan forzar un rebuild después de un bump
     * de versión (el TTL de 10 min es demasiado largo para tests).
     */
    public void invalidateCache() {
        cache.invalidateAll();
    }

    private TileEntry buildTile(int z, int x, int y, long version) {
        Timer.Sample sample = Timer.start();
        try {
            Envelope tileEnv = WebMercator.tileEnvelopeMeters(z, x, y);

            // Query env: tile expandido por el buffer en metros (buffer px /
            // extent × ancho del tile). El MISMO rect alimenta el cover S2
            // (vía lon/lat) y las tres queries SQL (ST_MakeEnvelope 4326) y
            // el clip del encoder — sin la expansión, un feature dentro del
            // búfer (≤64px) no sería candidato y quedaría cortado en el borde.
            Envelope queryEnv = new Envelope(tileEnv);
            queryEnv.expandBy(tileEnv.getWidth() * props.buffer() / props.extent());
            Envelope queryEnvLonLat = WebMercator.metersToLonLat(queryEnv);

            // LOD: ~2 px en extent 4096, en metros 3857.
            double tolerance = 2.0 * WebMercator.WORLD_WIDTH / ((1L << z) * props.extent());

            MvtLayerParams layerParams = new MvtLayerParams(props.extent());
            MvtLayerProps layerProps = new MvtLayerProps();
            UserDataKeyValueMapConverter converter = new UserDataKeyValueMapConverter("fid");
            VectorTile.Tile.Layer.Builder layer =
                    MvtUtil.newLayerBuilder(z >= props.s2ZMin() ? LAYER_MANZANA : LAYER_TERRITORIO, layerParams);

            int featureCount;
            if (z >= props.s2ZMin()) {
                List<Long> cells = s2Cover.coverOfTile(z, x, y, queryEnvLonLat);
                if (cells.isEmpty()) {
                    // Safety: cover > 256 celdas o bbox no finito → GiST (bbox)
                    featureCount = encodeManzanas(layer, layerProps, converter,
                            repo.findManzanaCandidatesByEnvelope(
                                    queryEnvLonLat.getMinX(), queryEnvLonLat.getMinY(),
                                    queryEnvLonLat.getMaxX(), queryEnvLonLat.getMaxY()),
                            tileEnv, queryEnv, layerParams, tolerance, z, x, y);
                    routeGist.increment();
                } else {
                    s2Cells.record(cells.size());
                    routeS2.increment();
                    featureCount = encodeManzanas(layer, layerProps, converter,
                            repo.findManzanaCandidatesByS2Cover(
                                    cells,
                                    queryEnvLonLat.getMinX(), queryEnvLonLat.getMinY(),
                                    queryEnvLonLat.getMaxX(), queryEnvLonLat.getMaxY()),
                            tileEnv, queryEnv, layerParams, tolerance, z, x, y);
                }
            } else {
                featureCount = encodeDisueltos(layer, layerProps, converter,
                        repo.findDisueltoCandidates(
                                queryEnvLonLat.getMinX(), queryEnvLonLat.getMinY(),
                                queryEnvLonLat.getMaxX(), queryEnvLonLat.getMaxY()),
                        tileEnv, queryEnv, layerParams, tolerance, z, x, y);
                routeDissolved.increment();
            }

            // Las propiedades de capa (key/value dictionaries) se escriben
            // aunque no haya features — MVT vacío válido (sin capas) si 0.
            if (featureCount > 0) {
                MvtUtil.writeProps(layer, layerProps);
                VectorTile.Tile tile = VectorTile.Tile.newBuilder().addLayers(layer.build()).build();
                byte[] gzipped = gzipUnchecked(tile.toByteArray());
                tileSize.record(gzipped.length);
                return new TileEntry(new TileKey(z, x, y, version).etag(), gzipped);
            }
            byte[] gzipped = EMPTY_MVT_GZIPPED;
            tileSize.record(gzipped.length);
            return new TileEntry(new TileKey(z, x, y, version).etag(), gzipped);
        } finally {
            sample.stop(renderTimer);
        }
    }

    /**
     * Color del feature MVT: la fila DB gana; si {@code territory_settings}
     * no tiene color, se resuelve con la misma paleta del endpoint
     * {@code /colors} (paridad con el mapa desplegado). El gris
     * {@link #DEFAULT_COLOR} queda solo como último recurso.
     */
    private String resolveColor(Long territorioNumero, String rowColor) {
        if (rowColor != null) {
            return rowColor;
        }
        String resolved = colorResolver.colorFor(territorioNumero);
        return resolved != null ? resolved : DEFAULT_COLOR;
    }

    private int encodeManzanas(VectorTile.Tile.Layer.Builder layer, MvtLayerProps layerProps,
                               UserDataKeyValueMapConverter converter,
                               List<TerritoryTileRepository.ManzanaTileRow> rows,
                               Envelope tileEnv, Envelope clipEnv, MvtLayerParams layerParams,
                               double tolerance, int z, int x, int y) {
        int count = 0;
        for (TerritoryTileRepository.ManzanaTileRow row : rows) {
            try {
                Geometry geom = readWkb(row.getGeom());
                if (geom == null || geom.isEmpty()) {
                    continue;
                }
                if (hasNonFiniteCoordinate(geom)) {
                    skippedGeometries.increment();
                    log.warn("Tile {}/{}/{}: manzana {} omitida (geometría inválida): coordenada no finita (NaN/Infinito)",
                            z, x, y, row.getId());
                    continue;
                }
                Geometry simplified = TopologyPreservingSimplifier.simplify(geom, tolerance);
                Geometry tileGeom = JtsAdapter.createTileGeom(
                        simplified, tileEnv, clipEnv, geometryFactory, layerParams, null);
                if (tileGeom == null || tileGeom.isEmpty()) {
                    continue;
                }
                tileGeom.setUserData(Map.<String, Object>of(
                        "fid", row.getId(),
                        "territorio", row.getTerritorioPadre(),
                        "bloque", row.getNombreBloque() != null ? row.getNombreBloque() : "",
                        "color", resolveColor(row.getTerritorioPadre(), row.getColor())));
                JtsAdapter.addFeatures(layer, tileGeom, layerProps, converter);
                count++;
            } catch (StackOverflowError ex) {
                // Catching StackOverflowError es intencional: defensa por fila.
                // El SOE de la simplificación JTS no indica un hilo agotado —
                // surge en frames aislados al simplificar un vértice corrupto;
                // tras el unwind la pila del hilo queda intacta y el loop puede
                // seguir con las filas sanas.
                skippedGeometries.increment();
                log.warn("Tile {}/{}/{}: manzana {} omitida (StackOverflowError en simplificación): {}",
                        z, x, y, row.getId(), ex.getMessage());
            } catch (Exception ex) {
                skippedGeometries.increment();
                log.warn("Tile {}/{}/{}: manzana {} omitida (geometría inválida): {}",
                        z, x, y, row.getId(), ex.getMessage());
            }
        }
        return count;
    }

    private int encodeDisueltos(VectorTile.Tile.Layer.Builder layer, MvtLayerProps layerProps,
                                UserDataKeyValueMapConverter converter,
                                List<TerritoryTileRepository.DisueltoTileRow> rows,
                                Envelope tileEnv, Envelope clipEnv, MvtLayerParams layerParams,
                                double tolerance, int z, int x, int y) {
        int count = 0;
        for (TerritoryTileRepository.DisueltoTileRow row : rows) {
            try {
                Geometry geom = readWkb(row.getGeom());
                if (geom == null || geom.isEmpty()) {
                    continue;
                }
                if (hasNonFiniteCoordinate(geom)) {
                    skippedGeometries.increment();
                    log.warn("Tile {}/{}/{}: territorio disuelto {} omitido (geometría inválida): coordenada no finita (NaN/Infinito)",
                            z, x, y, row.getTerritorioPadre());
                    continue;
                }
                Geometry simplified = TopologyPreservingSimplifier.simplify(geom, tolerance);
                Geometry tileGeom = JtsAdapter.createTileGeom(
                        simplified, tileEnv, clipEnv, geometryFactory, layerParams, null);
                if (tileGeom == null || tileGeom.isEmpty()) {
                    continue;
                }
                tileGeom.setUserData(Map.<String, Object>of(
                        "tid", row.getTerritorioPadre(),
                        "color", resolveColor(row.getTerritorioPadre(), row.getColor()),
                        "nombre", "Territorio " + row.getTerritorioPadre(),
                        "total", row.getTotalManzanas()));
                JtsAdapter.addFeatures(layer, tileGeom, layerProps, converter);
                count++;
            } catch (StackOverflowError ex) {
                // Ver comentario en encodeManzanas: catching StackOverflowError
                // es intencional — defensa por fila contra vértices corruptos.
                skippedGeometries.increment();
                log.warn("Tile {}/{}/{}: territorio disuelto {} omitido (StackOverflowError en simplificación): {}",
                        z, x, y, row.getTerritorioPadre(), ex.getMessage());
            } catch (Exception ex) {
                skippedGeometries.increment();
                log.warn("Tile {}/{}/{}: territorio disuelto {} omitido (geometría inválida): {}",
                        z, x, y, row.getTerritorioPadre(), ex.getMessage());
            }
        }
        return count;
    }

    private Geometry readWkb(byte[] wkb) {
        if (wkb == null || wkb.length == 0) {
            return null;
        }
        try {
            return wkbReader.get().read(wkb);
        } catch (ParseException ex) {
            // Unchecked: el caller (encodeManzanas/encodeDisueltos) captura
            // Exception y cuenta la geometría como omitida.
            throw new IllegalArgumentException("WKB inválido de manzana/territorio", ex);
        }
    }

    /**
     * True si la geometría contiene alguna coordenada NaN/Infinito. El WKB de
     * PostGIS puede traer vértices corruptos; simplificarlos con JTS puede
     * desbordar la pila ({@link StackOverflowError}, no capturable como
     * {@link Exception}) y tumbar el tile completo — verificar antes de
     * simplificar permite omitir solo la fila envenenada.
     *
     * <p>Solo se inspeccionan X/Y: la Z de una geometría 2D es NaN por diseño.</p>
     */
    private static boolean hasNonFiniteCoordinate(Geometry geom) {
        for (Coordinate c : geom.getCoordinates()) {
            if (!Double.isFinite(c.x) || !Double.isFinite(c.y)) {
                return true;
            }
        }
        return false;
    }

    /** Comprime el PBF con gzip (siempre, sin negociar Accept-Encoding). */
    static byte[] gzip(byte[] data) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(16, data.length / 2));
        try (GZIPOutputStream gz = new GZIPOutputStream(bos)) {
            gz.write(data);
        }
        return bos.toByteArray();
    }

    /**
     * {@link #gzip} sin checked exception: la lambda de la caché Caffeine
     * ({@code cache.get(key, loader)}) no puede lanzar checked exceptions, y
     * un fallo de compresión es un error de pipeline irrecuperable (el PBF
     * en memoria ya está construido) — se propaga como {@code IllegalStateException}.
     */
    private static byte[] gzipUnchecked(byte[] data) {
        try {
            return gzip(data);
        } catch (IOException ex) {
            throw new IllegalStateException("No se pudo comprimir el tile MVT con gzip", ex);
        }
    }

    /**
     * Tile MVT vacío (0 capas) ya comprimido en gzip. Mismo contenido para
     * cualquier (z,x,y): lo usa el controlador cuando el render falla, para
     * devolver un 200 válido y cacheable en vez de un 500 sin cuerpo.
     *
     * <p>El ETag que lo acompaña (generado por el controlador con la versión
     * de datos) es lo que cambia entre versiones; el cliente revalida y el
     * tile se auto-repara cuando sube {@code data_version}.</p>
     */
    static final byte[] EMPTY_MVT_GZIPPED = emptyMvtGzipped();

    private static byte[] emptyMvtGzipped() {
        return gzipUnchecked(VectorTile.Tile.newBuilder().build().toByteArray());
    }
}
