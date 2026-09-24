package com.predicador.territory.service;

import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.territory.dto.ImportResultado;
import com.predicador.territory.dto.ManzanaAdminRequest;
import com.predicador.territory.dto.ManzanaAdminResponse;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Edición de manzanas y territorios desde el panel de administración.
 *
 * <p>Toda la geometría se valida y transforma en PostGIS: el editor envía
 * GeoJSON 2D en WGS84 y la columna es {@code geometry(GeometryZ, 4326)}, así
 * que se guarda con {@code ST_Force3D}. Los ids de manzana son los de la base
 * y nunca se reutilizan ni se cambian, porque los reportes los referencian.</p>
 *
 * <p>Cada cambio, dentro de la misma transacción: fija los colores vigentes
 * (ver {@link #congelarColores()}), refresca los datos derivados
 * ({@link DerivedGeometryRefresher}) y, tras el commit, vacía los cachés del
 * servicio para que el mapa vea la edición de inmediato.</p>
 */
@Service
public class ManzanaAdminService {

    static final double AREA_MINIMA_M2 = 10;
    /** La manzana más grande cargada ronda 2,2 km²; 10 km² deja margen sin aceptar errores groseros. */
    static final double AREA_MAXIMA_M2 = 10_000_000;
    /** Superposición a partir de la cual se avisa: tolera bordes dibujados levemente encimados. */
    static final double SOLAPE_MINIMO_M2 = 5;
    static final int MAX_FEATURES_IMPORT = 5_000;

    private final JdbcClient jdbc;
    private final DerivedGeometryRefresher derived;
    private final CacheManager cacheManager;
    private final TerritoryService territoryService;

    public ManzanaAdminService(JdbcClient jdbc, DerivedGeometryRefresher derived, CacheManager cacheManager,
                               TerritoryService territoryService) {
        this.jdbc = jdbc;
        this.derived = derived;
        this.cacheManager = cacheManager;
        this.territoryService = territoryService;
    }

    /** Todas las manzanas como FeatureCollection, con el id real como {@code id} del feature. */
    @Transactional(readOnly = true)
    public String listarGeoJson() {
        return jdbc.sql("""
                SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(
                    json_build_object(
                        'type', 'Feature',
                        'id', m.id,
                        'geometry', ST_AsGeoJSON(ST_Force2D(m.geometry), 7)::json,
                        'properties', json_build_object(
                            'id', m.id,
                            'territorio', m.territorio_padre,
                            'nombre', m.nombre_bloque,
                            'areaM2', round(ST_Area(m.geometry::geography)),
                            'valida', ST_IsValid(m.geometry)))
                    ORDER BY m.territorio_padre, m.nombre_bloque), '[]'::json))::text
                FROM manzanas_territorio m
                """)
                .query(String.class)
                .single();
    }

    @Transactional(readOnly = true)
    public ManzanaAdminResponse obtener(Long id) {
        ManzanaAdminResponse base = jdbc.sql("""
                SELECT id, territorio_padre, nombre_bloque, ST_Area(geometry::geography) AS area,
                       ST_IsValid(geometry) AS valida, ST_AsGeoJSON(ST_Force2D(geometry), 7) AS geo
                FROM manzanas_territorio WHERE id = :id
                """)
                .param("id", id)
                .query((rs, n) -> new ManzanaAdminResponse(
                        rs.getLong("id"), rs.getLong("territorio_padre"), rs.getString("nombre_bloque"),
                        Math.round(rs.getDouble("area")), rs.getBoolean("valida"), List.of(), rs.getString("geo")))
                .optional()
                .orElseThrow(() -> new ResourceNotFoundException("Manzana", id));
        return new ManzanaAdminResponse(base.id(), base.territorio(), base.nombre(), base.areaM2(),
                base.valida(), solapes(id), base.geometria());
    }

    @Transactional
    public ManzanaAdminResponse crear(ManzanaAdminRequest req) {
        String nombre = limpiarNombre(req.nombre());
        exigirGeometriaValida(req.geometria());
        congelarColores();
        bloquearEscrituras();
        exigirNombreLibre(req.territorio(), nombre, null);

        long id = siguienteId();
        insertar(id, req.territorio(), nombre, req.geometria());
        despuesDeCambiar(Set.of(req.territorio()), Set.of(id));
        return obtener(id);
    }

    @Transactional
    public ManzanaAdminResponse actualizar(Long id, ManzanaAdminRequest req) {
        String nombre = limpiarNombre(req.nombre());
        Long territorioAnterior = territorioDe(id);
        if (req.geometria() != null) {
            exigirGeometriaValida(req.geometria());
        }
        congelarColores();
        bloquearEscrituras();
        exigirNombreLibre(req.territorio(), nombre, id);

        jdbc.sql("UPDATE manzanas_territorio SET territorio_padre = :t, nombre_bloque = :n WHERE id = :id")
                .param("t", req.territorio())
                .param("n", nombre)
                .param("id", id)
                .update();
        if (req.geometria() != null) {
            jdbc.sql("""
                    UPDATE manzanas_territorio
                    SET geometry = ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326))
                    WHERE id = :id
                    """)
                    .param("gj", req.geometria())
                    .param("id", id)
                    .update();
        }
        // HashSet y no Set.of: si no cambió de territorio los dos valores son
        // iguales y Set.of lanza IllegalArgumentException por duplicado.
        Set<Long> afectados = new HashSet<>(List.of(territorioAnterior, req.territorio()));
        despuesDeCambiar(afectados, req.geometria() != null ? Set.of(id) : Set.of());
        return obtener(id);
    }

    @Transactional
    public void eliminar(Long id) {
        Long territorio = territorioDe(id);
        congelarColores();
        // manzana_s2_cover tiene ON DELETE CASCADE hacia manzanas_territorio.
        jdbc.sql("DELETE FROM manzanas_territorio WHERE id = :id").param("id", id).update();
        despuesDeCambiar(Set.of(territorio), Set.of());
    }

    /**
     * Corrige una geometría inválida (auto-intersecciones, anillos cruzados)
     * con {@code ST_MakeValid}, conservando solo la parte poligonal.
     */
    @Transactional
    public ManzanaAdminResponse reparar(Long id) {
        Long territorio = territorioDe(id);
        int cambiadas = jdbc.sql("""
                UPDATE manzanas_territorio m
                SET geometry = ST_Force3D(CASE WHEN ST_NumGeometries(x.g) = 1 THEN ST_GeometryN(x.g, 1) ELSE x.g END)
                FROM (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Force2D(geometry)), 3)) AS g
                      FROM manzanas_territorio WHERE id = :id) x
                WHERE m.id = :id AND NOT ST_IsValid(m.geometry) AND NOT ST_IsEmpty(x.g)
                """)
                .param("id", id)
                .update();
        if (cambiadas > 0) {
            despuesDeCambiar(Set.of(territorio), Set.of(id));
        }
        return obtener(id);
    }

    /** Mueve manzanas a otro territorio; así también se crean territorios nuevos. */
    @Transactional
    public int reasignar(List<Long> ids, Long territorio) {
        Set<Long> unicos = new TreeSet<>(ids);
        congelarColores();
        bloquearEscrituras();

        List<Map<String, Object>> filas = jdbc.sql(
                        "SELECT id, territorio_padre, nombre_bloque FROM manzanas_territorio WHERE id IN (:ids)")
                .param("ids", unicos)
                .query()
                .listOfRows();
        if (filas.size() != unicos.size()) {
            Set<Long> faltantes = new TreeSet<>(unicos);
            filas.forEach(f -> faltantes.remove(((Number) f.get("id")).longValue()));
            throw new ResourceNotFoundException("Manzana", faltantes.toString());
        }

        Set<String> nombresMovidos = new HashSet<>();
        Set<Long> afectados = new HashSet<>(Set.of(territorio));
        for (Map<String, Object> f : filas) {
            afectados.add(((Number) f.get("territorio_padre")).longValue());
            if (!nombresMovidos.add(clave((String) f.get("nombre_bloque")))) {
                throw conflicto("Hay dos manzanas con el mismo nombre en la selección: " + f.get("nombre_bloque"));
            }
        }
        List<String> choques = jdbc.sql("""
                        SELECT nombre_bloque FROM manzanas_territorio
                        WHERE territorio_padre = :t AND id NOT IN (:ids)
                        """)
                .param("t", territorio)
                .param("ids", unicos)
                .query(String.class)
                .list()
                .stream()
                .filter(n -> nombresMovidos.contains(clave(n)))
                .toList();
        if (!choques.isEmpty()) {
            throw conflicto("El territorio " + territorio + " ya tiene manzanas con esos nombres: "
                    + String.join(", ", choques));
        }

        int actualizadas = jdbc.sql("UPDATE manzanas_territorio SET territorio_padre = :t WHERE id IN (:ids)")
                .param("t", territorio)
                .param("ids", unicos)
                .update();
        despuesDeCambiar(afectados, Set.of());
        return actualizadas;
    }

    /** Borra un territorio completo (sus manzanas y su color). */
    @Transactional
    public int eliminarTerritorio(Long numero) {
        congelarColores();
        int eliminadas = jdbc.sql("DELETE FROM manzanas_territorio WHERE territorio_padre = :t")
                .param("t", numero)
                .update();
        if (eliminadas == 0) {
            throw new ResourceNotFoundException("Territorio", numero);
        }
        jdbc.sql("DELETE FROM territory_settings WHERE territory_number = :t").param("t", numero).update();
        despuesDeCambiar(Set.of(numero), Set.of());
        return eliminadas;
    }

    /**
     * Importa un FeatureCollection GeoJSON (por ejemplo exportado desde QGIS).
     * Cada feature necesita {@code territorio} y {@code nombre} en sus
     * propiedades (también se aceptan {@code territorio_padre} y
     * {@code nombre_bloque}). Todo o nada: con un solo error no se importa nada.
     */
    @Transactional
    public ImportResultado importar(String featureCollection) {
        List<Map<String, Object>> features;
        try {
            features = jdbc.sql("""
                    SELECT ord,
                           COALESCE(f->'properties'->>'territorio', f->'properties'->>'territorio_padre') AS territorio,
                           COALESCE(f->'properties'->>'nombre', f->'properties'->>'nombre_bloque') AS nombre,
                           (f->'geometry')::text AS geometria
                    FROM json_array_elements(CAST(:fc AS json)->'features') WITH ORDINALITY AS t(f, ord)
                    ORDER BY ord
                    """)
                    .param("fc", featureCollection)
                    .query()
                    .listOfRows();
        } catch (DataAccessException e) {
            throw new IllegalArgumentException("El archivo no es un FeatureCollection GeoJSON válido");
        }
        if (features.isEmpty()) {
            throw new IllegalArgumentException("El archivo no tiene features");
        }
        if (features.size() > MAX_FEATURES_IMPORT) {
            throw new IllegalArgumentException("Máximo " + MAX_FEATURES_IMPORT + " manzanas por importación");
        }

        congelarColores();
        bloquearEscrituras();
        Map<Long, Set<String>> nombresPorTerritorio = new HashMap<>();
        List<String> errores = new ArrayList<>();
        List<Object[]> validas = new ArrayList<>();
        for (Map<String, Object> f : features) {
            String etiqueta = "Feature " + f.get("ord");
            Long territorio;
            try {
                territorio = Long.valueOf(String.valueOf(f.get("territorio")).trim());
            } catch (NumberFormatException e) {
                errores.add(etiqueta + ": falta la propiedad 'territorio' (número)");
                continue;
            }
            String nombre = f.get("nombre") == null ? "" : ((String) f.get("nombre")).trim();
            if (nombre.isEmpty() || nombre.length() > 60) {
                errores.add(etiqueta + ": falta la propiedad 'nombre' (máx. 60 caracteres)");
                continue;
            }
            String geometria = (String) f.get("geometria");
            try {
                exigirGeometriaValida(geometria);
            } catch (IllegalArgumentException e) {
                errores.add(etiqueta + " (" + nombre + "): " + e.getMessage());
                continue;
            }
            Set<String> nombres = nombresPorTerritorio.computeIfAbsent(territorio, this::nombresDe);
            if (!nombres.add(clave(nombre))) {
                errores.add(etiqueta + ": el territorio " + territorio + " ya tiene una manzana '" + nombre + "'");
                continue;
            }
            validas.add(new Object[] {territorio, nombre, geometria});
        }
        if (!errores.isEmpty()) {
            List<String> muestra = errores.size() > 20 ? errores.subList(0, 20) : errores;
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se importó nada. "
                    + errores.size() + " error(es): " + String.join(" | ", muestra));
        }

        long id = siguienteId();
        Set<Long> ids = new HashSet<>();
        for (Object[] v : validas) {
            insertar(id, (Long) v[0], (String) v[1], (String) v[2]);
            ids.add(id++);
        }
        despuesDeCambiar(nombresPorTerritorio.keySet(), ids);
        return new ImportResultado(validas.size(), new ArrayList<>(new TreeSet<>(nombresPorTerritorio.keySet())));
    }

    /**
     * Revisión de calidad de todo el mapa: geometrías inválidas y pares de
     * manzanas que se superponen (probables errores de dibujo o duplicados).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> calidad() {
        List<Long> invalidas = jdbc.sql(
                        "SELECT id FROM manzanas_territorio WHERE NOT ST_IsValid(geometry) ORDER BY id")
                .query(Long.class)
                .list();
        List<Map<String, Object>> solapes = jdbc.sql("""
                        SELECT a_id AS "a", b_id AS "b", round(area) AS "areaM2" FROM (
                            SELECT a.id AS a_id, b.id AS b_id,
                                   ST_Area(ST_Intersection(ST_Force2D(a.geometry), ST_Force2D(b.geometry))::geography) AS area
                            FROM manzanas_territorio a
                            JOIN manzanas_territorio b ON a.id < b.id AND a.geometry && b.geometry
                            WHERE ST_IsValid(a.geometry) AND ST_IsValid(b.geometry)
                              AND ST_Intersects(a.geometry, b.geometry)
                        ) x
                        WHERE area > :min
                        ORDER BY area DESC
                        """)
                .param("min", SOLAPE_MINIMO_M2)
                .query()
                .listOfRows();
        return Map.of("invalidas", invalidas, "solapes", solapes);
    }

    private List<Long> solapes(Long id) {
        return jdbc.sql("""
                        SELECT o.id FROM manzanas_territorio m
                        JOIN manzanas_territorio o ON o.id <> m.id AND o.geometry && m.geometry
                        WHERE m.id = :id AND ST_IsValid(m.geometry) AND ST_IsValid(o.geometry)
                          AND ST_Area(ST_Intersection(ST_Force2D(o.geometry), ST_Force2D(m.geometry))::geography) > :min
                        ORDER BY o.id
                        """)
                .param("id", id)
                .param("min", SOLAPE_MINIMO_M2)
                .query(Long.class)
                .list();
    }

    private void exigirGeometriaValida(String geojson) {
        if (geojson == null || geojson.isBlank()) {
            throw new IllegalArgumentException("La geometría es obligatoria");
        }
        Map<String, Object> g;
        try {
            g = jdbc.sql("""
                    WITH x AS (SELECT ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(:gj)), 4326) AS g),
                         r AS (SELECT g, ST_XMin(g) >= -180 AND ST_XMax(g) <= 180
                                        AND ST_YMin(g) >= -90 AND ST_YMax(g) <= 90 AS en_rango FROM x)
                    SELECT GeometryType(g) AS tipo, ST_IsValid(g) AS valida, ST_IsValidReason(g) AS razon, en_rango,
                           CASE WHEN en_rango THEN ST_Area(g::geography) ELSE 0 END AS area
                    FROM r
                    """)
                    .param("gj", geojson)
                    .query()
                    .singleRow();
        } catch (DataAccessException e) {
            throw new IllegalArgumentException("La geometría no es un GeoJSON válido");
        }
        String tipo = (String) g.get("tipo");
        if (!"POLYGON".equals(tipo) && !"MULTIPOLYGON".equals(tipo)) {
            throw new IllegalArgumentException("La geometría debe ser un polígono (llegó " + tipo + ")");
        }
        if (!Boolean.TRUE.equals(g.get("en_rango"))) {
            throw new IllegalArgumentException("Las coordenadas deben estar en grados (longitud, latitud WGS84)");
        }
        if (!Boolean.TRUE.equals(g.get("valida"))) {
            throw new IllegalArgumentException("El polígono no es válido: " + g.get("razon")
                    + ". Revisá que los bordes no se crucen.");
        }
        double area = ((Number) g.get("area")).doubleValue();
        if (area < AREA_MINIMA_M2 || area > AREA_MAXIMA_M2) {
            throw new IllegalArgumentException(String.format(Locale.ROOT,
                    "Área fuera de rango (%.0f m²): debe estar entre %.0f m² y %.0f km²",
                    area, AREA_MINIMA_M2, AREA_MAXIMA_M2 / 1_000_000));
        }
    }

    private void insertar(long id, Long territorio, String nombre, String geojson) {
        jdbc.sql("""
                INSERT INTO manzanas_territorio (id, territorio_padre, nombre_bloque, geometry)
                VALUES (:id, :t, :n, ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326)))
                """)
                .param("id", id)
                .param("t", territorio)
                .param("n", nombre)
                .param("gj", geojson)
                .update();
    }

    /**
     * La columna {@code id} no tiene secuencia (los datos se importaron con
     * ids propios), así que el siguiente id se calcula bajo
     * {@link #bloquearEscrituras()} para que dos altas no choquen.
     *
     * <p>Además de las manzanas vigentes se miran los ids citados en los
     * reportes: si se borra la manzana con el id más alto, una nueva no debe
     * recibir ese id y heredar las marcas de reportes viejos. Cuando llegue la
     * migración V3 de territory (mapa MapLibre) conviene reemplazar esto por
     * una secuencia en una migración nueva.</p>
     */
    private long siguienteId() {
        long maximo = jdbc.sql("SELECT COALESCE(MAX(id), 0) FROM manzanas_territorio").query(Long.class).single();
        if (tablaExiste("registro_predicacion")) {
            long citado = jdbc.sql("""
                    SELECT COALESCE(MAX(x::bigint), 0)
                    FROM registro_predicacion r, unnest(string_to_array(r.manzanas_ids, ',')) AS x
                    WHERE x ~ '^[0-9]{1,18}$'
                    """)
                    .query(Long.class)
                    .single();
            maximo = Math.max(maximo, citado);
        }
        return maximo + 1;
    }

    private boolean tablaExiste(String tabla) {
        return Boolean.TRUE.equals(jdbc.sql("SELECT to_regclass(:t) IS NOT NULL")
                .param("t", "public." + tabla)
                .query(Boolean.class)
                .single());
    }

    /** Serializa escrituras concurrentes del editor; las lecturas del mapa no se bloquean. */
    private void bloquearEscrituras() {
        jdbc.sql("LOCK TABLE manzanas_territorio IN SHARE ROW EXCLUSIVE MODE").update();
    }

    private void exigirNombreLibre(Long territorio, String nombre, Long exceptoId) {
        boolean ocupado = jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM manzanas_territorio
                                       WHERE territorio_padre = :t AND lower(trim(nombre_bloque)) = :n
                                         AND (CAST(:excepto AS bigint) IS NULL OR id <> :excepto))
                        """)
                .param("t", territorio)
                .param("n", clave(nombre))
                .param("excepto", exceptoId)
                .query(Boolean.class)
                .single();
        if (ocupado) {
            throw conflicto("El territorio " + territorio + " ya tiene una manzana llamada '" + nombre + "'");
        }
    }

    private Set<String> nombresDe(Long territorio) {
        Set<String> nombres = new HashSet<>();
        jdbc.sql("SELECT nombre_bloque FROM manzanas_territorio WHERE territorio_padre = :t")
                .param("t", territorio)
                .query(String.class)
                .list()
                .forEach(n -> nombres.add(clave(n)));
        return nombres;
    }

    private Long territorioDe(Long id) {
        return jdbc.sql("SELECT territorio_padre FROM manzanas_territorio WHERE id = :id")
                .param("id", id)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> new ResourceNotFoundException("Manzana", id));
    }

    /**
     * Los territorios sin color guardado toman uno de la paleta según su
     * posición en la lista ({@link TerritoryService#getAllColors()}). Crear o
     * borrar un territorio corre esas posiciones y le cambiaría el color a
     * decenas de territorios, así que antes de cada edición se guardan los
     * colores vigentes de los que todavía no lo tienen.
     */
    private void congelarColores() {
        Map<Long, String> vigentes = territoryService.getAllColors();
        for (Map.Entry<Long, String> e : vigentes.entrySet()) {
            jdbc.sql("""
                    INSERT INTO territory_settings (territory_number, color) VALUES (:t, :c)
                    ON CONFLICT (territory_number) DO NOTHING
                    """)
                    .param("t", e.getKey())
                    .param("c", e.getValue())
                    .update();
        }
    }

    private void despuesDeCambiar(Collection<Long> territorios, Collection<Long> manzanasConGeometriaNueva) {
        derived.refresh(territorios, manzanasConGeometriaNueva);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    vaciarCaches();
                }
            });
        } else {
            vaciarCaches();
        }
    }

    private void vaciarCaches() {
        for (String nombre : cacheManager.getCacheNames()) {
            Cache cache = cacheManager.getCache(nombre);
            if (cache != null) {
                cache.clear();
            }
        }
    }

    private static String limpiarNombre(String nombre) {
        String limpio = nombre == null ? "" : nombre.trim();
        if (limpio.isEmpty()) {
            throw new IllegalArgumentException("El nombre de la manzana es obligatorio");
        }
        return limpio;
    }

    private static String clave(String nombre) {
        return nombre == null ? "" : nombre.trim().toLowerCase(Locale.ROOT);
    }

    private static ResponseStatusException conflicto(String mensaje) {
        return new ResponseStatusException(HttpStatus.CONFLICT, mensaje);
    }
}
