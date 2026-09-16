package com.predicador.territory.tile;

import com.predicador.territory.model.ManzanaTerritorio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * SQL nativo del pipeline MVT. Consultas candidatas por tile:
 *
 * <ul>
 *   <li><b>manzanas z ≥ s2-z-min (12):</b> cobertura S2 (btree sobre
 *       {@code s2_cell_id}) + filtro fino {@code ST_Intersects} sobre el
 *       conjunto pequeño — la geometría de salida se transforma a 3857
 *       para el encoder (JTS en metros del mundo).</li>
 *   <li><b>fallback GiST:</b> cuando el cover del tile supera el safety de
 *       256 celdas o la manzana no tiene cover, bbox {@code &&} con el
 *       índice GiST existente (V2).</li>
 *   <li><b>disueltos z ≤ 11:</b> capa {@code territorio} desde
 *       {@code territorio_disuelto} (pocas filas, bbox {@code &&}).</li>
 * </ul>
 *
 * <p>Los alias se entrecomillan para preservar el camelCase en Postgres
 * (misma convención que {@code TerritoryRepository}).</p>
 */
@Repository
public interface TerritoryTileRepository extends JpaRepository<ManzanaTerritorio, Long> {

    interface ManzanaTileRow {
        Long getId();

        Long getTerritorioPadre();

        String getNombreBloque();

        String getColor();

        byte[] getGeom();
    }

    interface DisueltoTileRow {
        Long getTerritorioPadre();

        Integer getTotalManzanas();

        String getColor();

        byte[] getGeom();
    }

    interface ExtentRow {
        Double getMinX();

        Double getMinY();

        Double getMaxX();

        Double getMaxY();
    }

    /**
     * Candidatos manzana vía btree S2 + filtro fino espacial.
     * La geometría (4326) se fuerza 2D y se proyecta a 3857 en SQL.
     */
    @Query(value = """
            SELECT DISTINCT m.id AS id, m.territorio_padre AS "territorioPadre",
                   m.nombre_bloque AS "nombreBloque", ts.color AS color,
                   ST_AsBinary(ST_Transform(ST_Force2D(m.geometry), 3857)) AS geom
            FROM manzanas_territorio m
            JOIN manzana_s2_cover s ON s.manzana_id = m.id
            LEFT JOIN territory_settings ts ON ts.territory_number = m.territorio_padre
            WHERE s.s2_cell_id IN (:cells)
              AND ST_Intersects(m.geometry, ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326))
            """, nativeQuery = true)
    List<ManzanaTileRow> findManzanaCandidatesByS2Cover(
            @Param("cells") List<Long> cells,
            @Param("minx") double minx, @Param("miny") double miny,
            @Param("maxx") double maxx, @Param("maxy") double maxy);

    /**
     * Fallback GiST: manzanas cuyo bbox intersecta el envelope (sin filtro
     * fino; el clip del encoder descarta lo que quede fuera del buffer).
     */
    @Query(value = """
            SELECT DISTINCT m.id AS id, m.territorio_padre AS "territorioPadre",
                   m.nombre_bloque AS "nombreBloque", ts.color AS color,
                   ST_AsBinary(ST_Transform(ST_Force2D(m.geometry), 3857)) AS geom
            FROM manzanas_territorio m
            LEFT JOIN territory_settings ts ON ts.territory_number = m.territorio_padre
            WHERE m.geometry && ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
            """, nativeQuery = true)
    List<ManzanaTileRow> findManzanaCandidatesByEnvelope(
            @Param("minx") double minx, @Param("miny") double miny,
            @Param("maxx") double maxx, @Param("maxy") double maxy);

    /** Capa {@code territorio} (disueltos) para z ≤ 11. */
    @Query(value = """
            SELECT d.territorio_padre AS "territorioPadre",
                   d.total_manzanas AS "totalManzanas", ts.color AS color,
                   ST_AsBinary(ST_Transform(ST_Force2D(d.geometry), 3857)) AS geom
            FROM territorio_disuelto d
            LEFT JOIN territory_settings ts ON ts.territory_number = d.territorio_padre
            WHERE d.geometry && ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
            """, nativeQuery = true)
    List<DisueltoTileRow> findDisueltoCandidates(
            @Param("minx") double minx, @Param("miny") double miny,
            @Param("maxx") double maxx, @Param("maxy") double maxy);

    /** Versión de datos vigente ({@code app_meta.data_version}). */
    @Query(value = "SELECT v FROM app_meta WHERE k = 'data_version'", nativeQuery = true)
    Optional<Long> findDataVersion();

    /**
     * Incrementa {@code data_version} en {@code app_meta}. Idempotente:
     * si la fila no existe la crea con v=2 (ON CONFLICT), si existe
     * incrementa v en 1.
     */
    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO app_meta (k, v) VALUES ('data_version', 2)
            ON CONFLICT (k) DO UPDATE SET v = app_meta.v + 1
            """, nativeQuery = true)
    void bumpDataVersion();

    /**
     * Bounds del dataset desde el extent agregado de los disueltos
     * (caché ~1h en {@link TileJsonService}). Devuelve una fila con
     * valores null si no hay territorios disueltos.
     */
    @Query(value = """
            SELECT ST_XMin(ext.e)::double precision AS "minX",
                   ST_YMin(ext.e)::double precision AS "minY",
                   ST_XMax(ext.e)::double precision AS "maxX",
                   ST_YMax(ext.e)::double precision AS "maxY"
            FROM (SELECT ST_Extent(geometry) AS e FROM territorio_disuelto) ext
            WHERE ext.e IS NOT NULL
            """, nativeQuery = true)
    Optional<ExtentRow> findExtent();

    // ─── F2: write-path queries ───────────────────────────────────────

    /**
     * Datos de geometría de una manzana para reindexación S2
     * ({@link TileWriteService#recomputeCovers}).
     *
     * <p>Devuelve la geometría como WKT (no WKB) porque el listener la
     * parsea con JTS {@code WKTReader} para obtener el bbox.</p>
     */
    @Query(value = """
            SELECT id, ST_AsText(geometry) AS geom, territorio_padre AS "territorioPadre"
            FROM manzanas_territorio
            WHERE id = :id
            """, nativeQuery = true)
    ManzanaGeometryRow findManzanaGeometryById(@Param("id") Long id);

    interface ManzanaGeometryRow {
        Long id();

        String geom();

        Long territorioPadre();
    }

    /**
     * Reemplaza la cobertura S2 de una manzana ({@code DELETE + INSERT}).
     * Se ejecuta en una transacción de solo escritura del listener async.
     */
    @Modifying
    @Transactional
    @Query(value = "DELETE FROM manzana_s2_cover WHERE manzana_id = :manzanaId", nativeQuery = true)
    void deleteS2CoverByManzanaId(@Param("manzanaId") Long manzanaId);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO manzana_s2_cover (manzana_id, s2_cell_id)
            VALUES (:manzanaId, :cellId)
            """, nativeQuery = true)
    void insertS2Cover(@Param("manzanaId") Long manzanaId, @Param("cellId") Long cellId);

    /**
     * Reemplaza la cobertura S2 completa de una manzana.
     * Borra todas las entradas y inserta las nuevas en lote.
     */
    default void replaceS2Cover(Long manzanaId, List<Long> cellIds) {
        deleteS2CoverByManzanaId(manzanaId);
        for (Long cellId : cellIds) {
            insertS2Cover(manzanaId, cellId);
        }
    }

    /**
     * Reconstruye el polígono disuelto de un territorio padre:
     * {@code DELETE + INSERT} en {@code territorio_disuelto} con
     * {@code ST_Union} de todas las manzanas del territorio.
     */
    @Modifying
    @Transactional
    @Query(value = """
            DELETE FROM territorio_disuelto WHERE territorio_padre = :tp
            """, nativeQuery = true)
    void deleteDisueltoByTerritorioPadre(@Param("tp") Long territorioPadre);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO territorio_disuelto (territorio_padre, geometry, total_manzanas)
            SELECT :tp,
                   ST_Multi(ST_CollectionExtract(ST_Force2D(ST_Union(geometry)), 3)),
                   count(*)
            FROM manzanas_territorio
            WHERE territorio_padre = :tp
            """, nativeQuery = true)
    void insertDisueltoFromManzanas(@Param("tp") Long territorioPadre);

    /**
     * Reconstruye el polígono disuelto completo para un territorio padre.
     */
    default void refreshTerritorioDisuelto(Long territorioPadre) {
        deleteDisueltoByTerritorioPadre(territorioPadre);
        insertDisueltoFromManzanas(territorioPadre);
    }
}