package com.predicador.territory.repository;

import com.predicador.territory.model.ManzanaTerritorio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TerritoryRepository extends JpaRepository<ManzanaTerritorio, Long> {

    List<ManzanaTerritorio> findByTerritorioPadreOrderByNombreBloqueAsc(Long territorioPadre);

    @Query("SELECT DISTINCT m.territorioPadre FROM ManzanaTerritorio m WHERE m.territorioPadre IS NOT NULL ORDER BY m.territorioPadre")
    List<Long> findDistinctTerritorioPadres();

    /**
     * Proyección para serialización GeoJSON. PostGIS genera el GeoJSON
     * ({@code ST_AsGeoJSON(ST_Force2D(...))}) evitando parsear WKB/WKT en Java.
     * Los alias se entrecomillan para preservar el camelCase en Postgres.
     *
     * <p>{@link #getId()} expone {@code manzanas_territorio.id} — el mismo
     * valor que el pipeline MVT publica como {@code fid} y que el GeoJSON
     * por territorio emite en la propiedad {@code fid} — de modo que el
     * emparejamiento {@code fid ↔ "{t}-{b}"} viaje junto a la geometría en
     * las features por territorio.</p>
     */
    interface ManzanaGeoJsonProjection {
        Long getId();
        Long getTerritorioPadre();
        String getNombreBloque();
        String getGeoJson();
    }

    @Query(value = "SELECT m.id AS \"id\", m.territorio_padre AS \"territorioPadre\", m.nombre_bloque AS \"nombreBloque\", "
            + "ST_AsGeoJSON(ST_Force2D(m.geometry)) AS \"geoJson\" "
            + "FROM manzanas_territorio m "
            + "WHERE m.territorio_padre IS NOT NULL "
            + "ORDER BY m.territorio_padre, m.nombre_bloque", nativeQuery = true)
    List<ManzanaGeoJsonProjection> findAllGeoJsonGroupedByTerritorio();

    @Query(value = "SELECT m.id AS \"id\", m.territorio_padre AS \"territorioPadre\", m.nombre_bloque AS \"nombreBloque\", "
            + "ST_AsGeoJSON(ST_Force2D(m.geometry)) AS \"geoJson\" "
            + "FROM manzanas_territorio m "
            + "WHERE m.territorio_padre = :territorioPadre "
            + "ORDER BY m.nombre_bloque", nativeQuery = true)
    List<ManzanaGeoJsonProjection> findGeoJsonByTerritorioPadre(@Param("territorioPadre") Long territorioPadre);

    /**
     * Proyección para {@code GET /api/v1/territories/metadata}: agregados
     * por territorio sin geometría. Los alias se entrecomillan para
     * preservar el camelCase en Postgres (misma convención que
     * {@link ManzanaGeoJsonProjection}).
     *
     * <p>{@code fids} llega como JSON ({@code json_agg(m.id)}) porque los
     * arrays de Postgres no se mapean de forma fiable a {@code List<Long>}
     * en consultas nativas; el servicio lo parsea con Jackson.</p>
     */
    interface TerritoryMetadataRow {
        Long getNumero();

        Double getMinLng();

        Double getMinLat();

        Double getMaxLng();

        Double getMaxLat();

        Double getCenterLng();

        Double getCenterLat();

        Long getManzanaCount();

        String getFids();
    }

    /**
     * Metadatos ligeros por territorio (una fila por {@code territorio_padre},
     * orden ascendente — paridad con {@link #findDistinctTerritorioPadres()}
     * y con el orden del mapa de colores de {@code /colors}).
     *
     * <p>Subconsulta interna agrega una sola vez ({@code ST_Extent} para el
     * bbox y {@code ST_Union} una única vez para el punto representativo);
     * la externa deriva los campos del DTO:</p>
     *
     * <ul>
     *   <li>{@code bounds}: bbox del territorio vía {@code ST_Extent} (cae a
     *       {@code null} si todas las geometrías son null).</li>
     *   <li>{@code center}: {@code ST_PointOnSurface} sobre la unión de las
     *       manzanas — punto garantizado dentro del polígono (nunca
     *       {@code ST_Centroid}, que puede caer fuera de un territorio
     *       cóncavo).</li>
     *   <li>{@code fids}: ids de feature ({@code manzanas_territorio.id}),
     *       los mismos que asigna el pipeline MVT y la propiedad {@code fid}
     *       del GeoJSON por territorio.</li>
     * </ul>
     *
     * <p>Consulta computada sobre tablas existentes — sin esquema nuevo;
     * sin concatenación de SQL (literal de consulta + agrupación).</p>
     */
    @Query(value = """
            SELECT g.territorio_padre AS "numero",
                   ST_XMin(g.bbox) AS "minLng",
                   ST_YMin(g.bbox) AS "minLat",
                   ST_XMax(g.bbox) AS "maxLng",
                   ST_YMax(g.bbox) AS "maxLat",
                   ST_X(ST_PointOnSurface(ST_Force2D(g.unida))) AS "centerLng",
                   ST_Y(ST_PointOnSurface(ST_Force2D(g.unida))) AS "centerLat",
                   g.cantidad AS "manzanaCount",
                   COALESCE(g.fids, '[]'::json)::text AS "fids"
            FROM (
                SELECT m.territorio_padre,
                       ST_Extent(m.geometry) AS bbox,
                       ST_Union(m.geometry) AS unida,
                       COUNT(*) AS cantidad,
                       json_agg(m.id ORDER BY m.id) AS fids
                FROM manzanas_territorio m
                WHERE m.territorio_padre IS NOT NULL
                GROUP BY m.territorio_padre
            ) g
            ORDER BY g.territorio_padre
            """, nativeQuery = true)
    List<TerritoryMetadataRow> findTerritoryMetadata();
}
