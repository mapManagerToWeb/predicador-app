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
     */
    interface ManzanaGeoJsonProjection {
        Long getTerritorioPadre();
        String getNombreBloque();
        String getGeoJson();
    }

    @Query(value = "SELECT m.territorio_padre AS \"territorioPadre\", m.nombre_bloque AS \"nombreBloque\", "
            + "ST_AsGeoJSON(ST_Force2D(m.geometry)) AS \"geoJson\" "
            + "FROM manzanas_territorio m "
            + "WHERE m.territorio_padre IS NOT NULL "
            + "ORDER BY m.territorio_padre, m.nombre_bloque", nativeQuery = true)
    List<ManzanaGeoJsonProjection> findAllGeoJsonGroupedByTerritorio();

    @Query(value = "SELECT m.territorio_padre AS \"territorioPadre\", m.nombre_bloque AS \"nombreBloque\", "
            + "ST_AsGeoJSON(ST_Force2D(m.geometry)) AS \"geoJson\" "
            + "FROM manzanas_territorio m "
            + "WHERE m.territorio_padre = :territorioPadre "
            + "ORDER BY m.nombre_bloque", nativeQuery = true)
    List<ManzanaGeoJsonProjection> findGeoJsonByTerritorioPadre(@Param("territorioPadre") Long territorioPadre);
}
