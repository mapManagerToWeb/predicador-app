package com.predicador.territory.tile;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.predicador.territory.tile.TerritoryTileRepository.DisueltoTileRow;
import com.predicador.territory.tile.TerritoryTileRepository.ManzanaTileRow;
import io.github.sebasbaumh.mapbox.vectortile.VectorTile;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Envelope;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.io.WKBWriter;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.util.List;

import static com.predicador.territory.tile.TestGzip.gunzip;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests del pipeline de render MVT (SPEC §5.2).
 *
 * <p>Cubre las tres rutas del controlador (S2, GiST, disueltos), el tile
 * vacío (MVT válido sin capas), la codificación y la correcta delegación
 * a las capas del repo.</p>
 */
@ExtendWith(MockitoExtension.class)
class TileServiceTest {

    private static final GeometryFactory GF = new GeometryFactory();
    private static final int Z14 = 14;
    private static final int X14 = 4976;
    private static final int Y14 = 9809;  // tile conteniendo (-70.65, -33.45)

    @Mock
    private TerritoryTileRepository repo;

    @Mock
    private DataVersionService versions;

    @Mock
    private S2CoverService s2Cover;

    private TileService service;
    private final TileProperties props =
            new TileProperties(19, 14, 12, 4096, 64, 1000, Duration.ofMinutes(10));
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @BeforeEach
    void setUp() {
        service = new TileService(repo, s2Cover, versions, props, registry);
    }

    // ---- helpers --------------------------------------------------------

    private static byte[] polygonWkb(double minX, double minY, double maxX, double maxY) {
        return new WKBWriter(2).write(GF.createPolygon(new Coordinate[]{
                new Coordinate(minX, minY),
                new Coordinate(maxX, minY),
                new Coordinate(maxX, maxY),
                new Coordinate(minX, maxY),
                new Coordinate(minX, minY)}));
    }

    private static ManzanaTileRow manzanaRow(long id, long territorio, String bloque, String color, byte[] wkb) {
        return new ManzanaTileRow() {
            public Long getId() { return id; }
            public Long getTerritorioPadre() { return territorio; }
            public String getNombreBloque() { return bloque; }
            public String getColor() { return color; }
            public byte[] getGeom() { return wkb; }
        };
    }

    private static DisueltoTileRow disueltoRow(long territorio, int total, String color, byte[] wkb) {
        return new DisueltoTileRow() {
            public Long getTerritorioPadre() { return territorio; }
            public Integer getTotalManzanas() { return total; }
            public String getColor() { return color; }
            public byte[] getGeom() { return wkb; }
        };
    }

    // ---- S2 path (z ≥ 12, cover no vacío) ------------------------------

    @Test
    void render_z14_usesS2RouteAndEncodesManzanaLayer() throws Exception {
        Envelope tileEnv = WebMercator.tileEnvelopeMeters(Z14, X14, Y14);
        byte[] wkb = polygonWkb(
                tileEnv.getMinX() + 10, tileEnv.getMinY() + 10,
                tileEnv.getMaxX() - 10, tileEnv.getMaxY() - 10);

        when(versions.current()).thenReturn(1L);
        when(s2Cover.coverOfTile(eq(Z14), eq(X14), eq(Y14), any(Envelope.class))).thenReturn(List.of(123456789L, 987654321L));
        when(repo.findManzanaCandidatesByS2Cover(
                anyList(), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(manzanaRow(5001, 12, "12.a", "#ff0000", wkb)));

        TileEntry entry = service.render(Z14, X14, Y14);

        assertThat(entry.etag()).isEqualTo("\"tile-14-4976-9809-v1\"");
        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));
        assertThat(tile.getLayersCount()).isEqualTo(1);
        VectorTile.Tile.Layer layer = tile.getLayers(0);
        assertThat(layer.getName()).isEqualTo("manzana");
        assertThat(layer.getFeaturesCount()).isEqualTo(1);

        VectorTile.Tile.Feature feature = layer.getFeatures(0);
        assertThat(feature.getId()).isEqualTo(5001L);

        verify(repo).findManzanaCandidatesByS2Cover(
                eq(List.of(123456789L, 987654321L)),
                anyDouble(), anyDouble(), anyDouble(), anyDouble());
        verifyNoMoreInteractions(repo);
    }

    // ---- GiST fallback (z ≥ 12, cover > 256 celdas → vacío) -----------

    @Test
    void render_z14_passesExpandedQueryEnvelopeToS2AndRepo() throws Exception {
        when(versions.current()).thenReturn(1L);
        when(s2Cover.coverOfTile(eq(Z14), eq(X14), eq(Y14), any(Envelope.class))).thenReturn(List.of(7L));
        when(repo.findManzanaCandidatesByS2Cover(
                anyList(), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of());

        service.render(Z14, X14, Y14);

        // El rect de consulta = tile expandido por el buffer en metros,
        // convertido a lon/lat — el mismo que alimenta el cover S2 y el
        // ST_MakeEnvelope (fix del dictamen: sin expandir, los features del
        // búfer del tile no serían candidatos).
        Envelope tileEnv = WebMercator.tileEnvelopeMeters(Z14, X14, Y14);
        double bufferMeters = tileEnv.getWidth() * 64.0 / 4096.0;
        Envelope expandedMeters = new Envelope(tileEnv);
        expandedMeters.expandBy(bufferMeters);
        Envelope expectedLonLat = WebMercator.metersToLonLat(expandedMeters);

        ArgumentCaptor<Envelope> captor = ArgumentCaptor.forClass(Envelope.class);
        verify(s2Cover).coverOfTile(eq(Z14), eq(X14), eq(Y14), captor.capture());
        assertThat(captor.getValue()).isEqualTo(expectedLonLat);

        // La misma lon/lat viaja al filtro fino ST_Intersects (4326).
        verify(repo).findManzanaCandidatesByS2Cover(anyList(),
                eq(expectedLonLat.getMinX()), eq(expectedLonLat.getMinY()),
                eq(expectedLonLat.getMaxX()), eq(expectedLonLat.getMaxY()));
    }

    @Test
    void render_z12_coverExceedsLimit_fallsBackToGiStEnvelope() throws Exception {
        Envelope tileEnv = WebMercator.tileEnvelopeMeters(12, 2048, 2048);
        byte[] wkb = polygonWkb(
                tileEnv.getMinX() + 10, tileEnv.getMinY() + 10,
                tileEnv.getMaxX() - 10, tileEnv.getMaxY() - 10);

        when(versions.current()).thenReturn(1L);
        when(s2Cover.coverOfTile(eq(12), eq(2048), eq(2048), any(Envelope.class)))
                .thenReturn(List.of()); // safety exceeded
        when(repo.findManzanaCandidatesByEnvelope(
                anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(manzanaRow(5002, 12, "12.b", "#00ff00", wkb)));

        TileEntry entry = service.render(12, 2048, 2048);

        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));
        assertThat(tile.getLayers(0).getName()).isEqualTo("manzana");
        assertThat(tile.getLayers(0).getFeaturesCount()).isEqualTo(1);
        verify(repo).findManzanaCandidatesByEnvelope(anyDouble(), anyDouble(), anyDouble(), anyDouble());
        verifyNoMoreInteractions(repo);
    }

    // ---- Low-zoom: disueltos (z < s2ZMin) -------------------------------

    @Test
    void render_z0_usesDissolvedTerritoryLayer() throws Exception {
        Envelope worldEnv = WebMercator.tileEnvelopeMeters(0, 0, 0);
        byte[] wkb = polygonWkb(
                worldEnv.getMinX() + 1000, worldEnv.getMinY() + 1000,
                worldEnv.getMaxX() - 1000, worldEnv.getMaxY() - 1000);

        when(versions.current()).thenReturn(1L);
        when(repo.findDisueltoCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(disueltoRow(7, 25, "#3cb44b", wkb)));

        TileEntry entry = service.render(0, 0, 0);

        assertThat(entry.etag()).isEqualTo("\"tile-0-0-0-v1\"");
        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));
        assertThat(tile.getLayersCount()).isEqualTo(1);
        assertThat(tile.getLayers(0).getName()).isEqualTo("territorio");
        assertThat(tile.getLayers(0).getFeaturesCount()).isEqualTo(1);

        verify(repo).findDisueltoCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble());
        verifyNoMoreInteractions(repo);
    }

    // ---- Tile vacío: MVT válido sin capas --------------------------------

    @Test
    void render_emptyTile_returnsValidEmptyMvt() throws Exception {
        when(versions.current()).thenReturn(1L);
        when(s2Cover.coverOfTile(eq(Z14), eq(X14), eq(Y14), any(Envelope.class))).thenReturn(List.of(42L));
        when(repo.findManzanaCandidatesByS2Cover(
                anyList(), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of()); // sin datos

        TileEntry entry = service.render(Z14, X14, Y14);

        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));
        assertThat(tile.getLayersCount()).isEqualTo(0);
        // ETag sigue siendo válido (el cliente lo cachea, sin refetch).
        assertThat(entry.etag()).isEqualTo("\"tile-14-4976-9809-v1\"");
    }

    // ---- Tile vacío en low-zoom (sin disueltos) ---------------------------

    @Test
    void render_lowZoom_noDisueltos_returnsEmptyMvt() throws Exception {
        when(versions.current()).thenReturn(1L);
        when(repo.findDisueltoCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of());

        TileEntry entry = service.render(0, 0, 0);

        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));
        assertThat(tile.getLayersCount()).isEqualTo(0);
    }

    // ---- Múltiples features en un tile -----------------------------------

    @Test
    void render_multipleFeatures_encodedInSameLayer() throws Exception {
        Envelope env = WebMercator.tileEnvelopeMeters(Z14, X14, Y14);
        byte[] wkbA = polygonWkb(env.getMinX() + 10, env.getMinY() + 10,
                env.getMinX() + env.getWidth() * 0.4, env.getMinY() + env.getHeight() * 0.4);
        byte[] wkbB = polygonWkb(env.getMaxX() - env.getWidth() * 0.4, env.getMaxY() - env.getHeight() * 0.4,
                env.getMaxX() - 10, env.getMaxY() - 10);

        when(versions.current()).thenReturn(1L);
        when(s2Cover.coverOfTile(eq(Z14), eq(X14), eq(Y14), any(Envelope.class))).thenReturn(List.of(111L));
        when(repo.findManzanaCandidatesByS2Cover(
                anyList(), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(
                        manzanaRow(1, 10, "10.a", "#111111", wkbA),
                        manzanaRow(2, 10, "10.b", "#222222", wkbB)));

        TileEntry entry = service.render(Z14, X14, Y14);
        VectorTile.Tile tile = VectorTile.Tile.parseFrom(gunzip(entry.gzippedPbf()));

        assertThat(tile.getLayersCount()).isEqualTo(1);
        assertThat(tile.getLayers(0).getName()).isEqualTo("manzana");
        assertThat(tile.getLayers(0).getFeaturesCount()).isEqualTo(2);
    }

    // ---- ETag cambia con dataVersion -------------------------------------

    @Test
    void render_differentDataVersion_producesDifferentEtag() throws Exception {
        Envelope env = WebMercator.tileEnvelopeMeters(Z14, X14, Y14);
        byte[] wkb = polygonWkb(env.getMinX() + 1, env.getMinY() + 1,
                env.getMaxX() - 1, env.getMaxY() - 1);

        when(s2Cover.coverOfTile(eq(Z14), eq(X14), eq(Y14), any(Envelope.class))).thenReturn(List.of(99L));
        when(repo.findManzanaCandidatesByS2Cover(
                anyList(), anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(manzanaRow(1, 10, "10.a", "#000000", wkb)));

        when(versions.current()).thenReturn(1L);
        TileEntry v1 = service.render(Z14, X14, Y14);

        when(versions.current()).thenReturn(2L);
        TileEntry v2 = service.render(Z14, X14, Y14);

        assertThat(v1.etag()).isEqualTo("\"tile-14-4976-9809-v1\"");
        assertThat(v2.etag()).isEqualTo("\"tile-14-4976-9809-v2\"");
        // Cuerpos diferentes (el gzip varía aunque el MVT sea idéntico —
        // la clave de caché cambia, construye de nuevo).
        // No comparamos bytes porque el MVT contenido es idéntico; la
        // distinción vive en el ETag.
    }
}