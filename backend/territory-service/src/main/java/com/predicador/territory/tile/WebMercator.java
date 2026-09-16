package com.predicador.territory.tile;

import org.locationtech.jts.geom.Envelope;

/**
 * Conversión Web Mercator (EPSG:3857) bidireccional para tiles xyz.
 *
 * <p>El tile en coordenadas de tile (0..extent) es la jurisdicción del
 * encoder MVT. El tile en metros 3857 es la jurisdicción de JTS
 * (simplify, clip). El tile en lon/lat es la jurisdicción de S2
 * (cobertura de rects).</p>
 *
 * <p>Width del mundo: {@code 2 * PI * 6378137 = 40075016.686 m}
 * (WGS-84 semieje mayor).</p>
 */
public final class WebMercator {

    /** Ancho del mundo EPSG:3857 en metros. */
    public static final double WORLD_WIDTH = 40075016.686;

    /**
     * Latitud máxima de Web Mercator (clamp): más allá de este valor
     * la proyección es asintótica. La fórmula de yMetersToLat ya trunca
     * para evitar celdas S2 degeneradas en polos.
     */
    public static final double MAX_LATITUDE = 85.05112877980659;

    private WebMercator() {
        // util class
    }

    /**
     * Envelope en metros 3857 de un tile xyz. x/y son 0-based en el
     * esquema Tile Map Service (TMS): y = 0 → borde norte.
     *
     * @return envelope con eje x ∈ [0, WORLD_WIDTH], eje y ∈ [0, WORLD_WIDTH]
     */
    public static Envelope tileEnvelopeMeters(int z, int x, int y) {
        long n = 1L << z;
        double tileSize = WORLD_WIDTH / n;
        double minx = x * tileSize;
        double maxx = (x + 1) * tileSize;
        double maxy = WORLD_WIDTH - y * tileSize;
        double miny = WORLD_WIDTH - (y + 1) * tileSize;
        return new Envelope(minx, maxx, miny, maxy);
    }

    /**
     * Bounding box en lon/lat (grados) de un tile xyz. Se usa para el
     * cover S2 y para el filtro fino {@code ST_Intersects} en 4326.
     *
     * @return envelope con x = lon (grados), y = lat (grados, norte arriba)
     */
    public static Envelope tileBoundsLonLat(int z, int x, int y) {
        long n = 1L << z;
        double minLon = x * 360.0 / n - 180.0;
        double maxLon = (x + 1) * 360.0 / n - 180.0;
        double latTop = yMetersToLat(y * WORLD_WIDTH / n);
        double latBottom = yMetersToLat((y + 1) * WORLD_WIDTH / n);
        // Clamp explícito: yMetersToLat ya trunca, pero por robustez
        double clampedTop = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latTop));
        double clampedBottom = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latBottom));
        double south = Math.min(clampedTop, clampedBottom);
        double north = Math.max(clampedTop, clampedBottom);
        return new Envelope(minLon, maxLon, south, north);
    }

    /**
     * Convierte la columna xyz de TMS a grados de longitud.
     */
    public static double xToLon(int z, int x) {
        return x * 360.0 / (1L << z) - 180.0;
    }

    /**
     * Convierte la fila xyz de TMS a grados de latitud (sistema
     * {@link com.google.common.geometry.S2LatLng} — clamped a ±85.05°).
     */
    public static double yToLat(int z, int y) {
        return yMetersToLat(y * WORLD_WIDTH / (1L << z));
    }

    /**
     * Envelope en lon/lat (grados) de un envelope en metros EPSG:3857
     * (x = lon, y = lat; inversa de {@link #tileEnvelopeMeters}).
     *
     * <p>Longitud sin clamp: el query env de un tile expandido por el
     * buffer puede salirse de ±180 en tiles pegados al anti-meridiano —
     * {@link S2CoverService#coverOfTile(int, int, int, Envelope)} normaliza.
     * La latitud sí se clampa a ±{@link #MAX_LATITUDE} (la proyección es
     * asintótica en los polos y un rect de tile nunca la supera).</p>
     */
    public static Envelope metersToLonLat(Envelope metersEnv) {
        double minLon = metersEnv.getMinX() / WORLD_WIDTH * 360.0 - 180.0;
        double maxLon = metersEnv.getMaxX() / WORLD_WIDTH * 360.0 - 180.0;
        double minLat = yMetersToLat(metersEnv.getMinY());
        double maxLat = yMetersToLat(metersEnv.getMaxY());
        double south = Math.min(minLat, maxLat);
        double north = Math.max(minLat, maxLat);
        return new Envelope(minLon, maxLon, south, north);
    }

    private static double yMetersToLat(double yMeters) {
        double latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yMeters / WORLD_WIDTH)));
        double latDeg = Math.toDegrees(latRad);
        return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latDeg));
    }
}