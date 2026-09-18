package com.predicador.territory.tile;

import org.locationtech.jts.geom.Envelope;

/**
 * Conversión Web Mercator (EPSG:3857) bidireccional para tiles xyz (TMS).
 *
 * <p>Convenciones de coordenadas:</p>
 * <ul>
 *   <li><b>lon/lat</b>: grados, latitud norte positiva.</li>
 *   <li><b>metros 3857</b>: eje y con origen en el ecuador y positivo al
 *       norte (misma convención que {@code ST_Transform(..., 3857)} y el
 *       encoder JTS). El mundo abarca {@code [-WORLD_WIDTH/2, +WORLD_WIDTH/2]}.</li>
 *   <li><b>xyz/TMS</b>: {@code y = 0} en el borde norte; las filas crecen
 *       hacia el sur.</li>
 * </ul>
 *
 * <p><b>Fix (2026-09-17/18):</b> {@code tileEnvelopeMeters} usaba
 * coordenadas de <em>grilla TMS</em> ({@code x ∈ [0, WORLD_WIDTH]},
 * {@code y ∈ [0, WORLD_WIDTH]} con origen en el sur) mientras
 * {@code metersToLonLat} las interpretaba con origen en el norte y el
 * oeste. La composición espejaba toda latitud al hemisferio opuesto y
 * desplazaba el eje x medio mundo al este: el envelope de cada tile quedaba
 * a ~20.000 km de las geometrías reales (tiles MVT vacíos en producción,
 * clip JTS sin intersecciones). Ahora el envelope en metros es EPSG:3857
 * real en AMBOS ejes (x ∈ [−WORLD_WIDTH/2, +WORLD_WIDTH/2], y = 0 en el
 * ecuador, norte positivo) — la misma convención que
 * {@code ST_Transform(geometry, 3857)} — y la latitud usa
 * {@code atan(sinh(y/R))}. {@code metersToLonLat} ya no aplica el offset
 * de ±180°: la longitud es la conversión directa {@code x * 360 / W}.</p>
 */
public final class WebMercator {

    /** Ancho del mundo EPSG:3857 en metros. */
    public static final double WORLD_WIDTH = 40075016.686;

    /**
     * Latitud máxima de Web Mercator (clamp): más allá de este valor
     * la proyección es asintótica. La fórmula de {@code metersToLat} ya
     * trunca para evitar celdas S2 degeneradas en polos.
     */
    public static final double MAX_LATITUDE = 85.05112877980659;

    /** Radio terrestre WGS-84 (semieje mayor) en metros = WORLD_WIDTH / 2π. */
    private static final double EARTH_RADIUS = WORLD_WIDTH / (2.0 * Math.PI);

    private WebMercator() {
        // util class
    }

    /**
     * Envelope en metros EPSG:3857 de un tile xyz. x/y son 0-based en el
     * esquema Tile Map Service (TMS): y = 0 → borde norte.
     *
     * <p>Convención EPSG:3857 absoluta (idéntica a {@code ST_Transform(…,
     * 3857)}): {@code x ∈ [−WORLD_WIDTH/2, +WORLD_WIDTH/2]} con el
     * antimeridiano en {@code -WORLD_WIDTH/2}, e {@code y ∈ [−WORLD_WIDTH/2,
     * +WORLD_WIDTH/2]} con el ecuador en 0. El clip del encoder JTS y las
     * geometrías leídas de PostGIS comparten este sistema — la regresión de
     * 2026-09-18 (tiles vacíos por desajuste de medio mundo en x).</p>
     *
     * @return envelope con ambos ejes en [−WORLD_WIDTH/2, +WORLD_WIDTH/2]
     */
    public static Envelope tileEnvelopeMeters(int z, int x, int y) {
        long n = 1L << z;
        double tileSize = WORLD_WIDTH / n;
        double minx = -WORLD_WIDTH / 2.0 + x * tileSize;
        double maxx = -WORLD_WIDTH / 2.0 + (x + 1) * tileSize;
        double maxy = WORLD_WIDTH / 2.0 - y * tileSize;
        double miny = WORLD_WIDTH / 2.0 - (y + 1) * tileSize;
        return new Envelope(minx, maxx, miny, maxy);
    }

    /**
     * Bounding box en lon/lat (grados) de un tile xyz. Se usa para el
     * cover S2 y para el filtro fino {@code ST_Intersects} en 4326.
     *
     * @return envelope con x = lon (grados), y = lat (grados, norte arriba)
     */
    public static Envelope tileBoundsLonLat(int z, int x, int y) {
        return metersToLonLat(tileEnvelopeMeters(z, x, y));
    }

    /**
     * Convierte la columna xyz de TMS a grados de longitud.
     */
    public static double xToLon(int z, int x) {
        return x * 360.0 / (1L << z) - 180.0;
    }

    /**
     * Convierte la fila xyz de TMS a grados de latitud del borde norte
     * de la fila (sistema TMS — la fila 0 empieza en +85.05°).
     */
    public static double yToLat(int z, int y) {
        return metersToLat(WORLD_WIDTH / 2.0 - y * (WORLD_WIDTH / (1L << z)));
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
     *
     * <p>Convención EPSG:3857 absoluta (fix 2026-09-18): la longitud es
     * {@code x * 360 / WORLD_WIDTH} — un x negativo (oeste del meridiano 0)
     * da una longitud negativa, sin offset de ±180 como antes.</p>
     */
    public static Envelope metersToLonLat(Envelope metersEnv) {
        double minLon = metersEnv.getMinX() / WORLD_WIDTH * 360.0;
        double maxLon = metersEnv.getMaxX() / WORLD_WIDTH * 360.0;
        double minLat = metersToLat(metersEnv.getMinY());
        double maxLat = metersToLat(metersEnv.getMaxY());
        double south = Math.min(minLat, maxLat);
        double north = Math.max(minLat, maxLat);
        return new Envelope(minLon, maxLon, south, north);
    }

    /**
     * Latitud en grados (clamp ±{@link #MAX_LATITUDE}) desde y-meters
     * EPSG:3857 (ecuador = 0, norte positivo). Inversa de la proyección
     * Mercator esférica: {@code lat = atan(sinh(y / R))}.
     */
    private static double metersToLat(double yMeters) {
        double latRad = Math.atan(Math.sinh(yMeters / EARTH_RADIUS));
        double latDeg = Math.toDegrees(latRad);
        return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latDeg));
    }
}