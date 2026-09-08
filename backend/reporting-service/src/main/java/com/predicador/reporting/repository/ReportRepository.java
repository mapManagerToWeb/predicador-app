package com.predicador.reporting.repository;

import com.predicador.reporting.model.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

@Repository
public interface ReportRepository extends JpaRepository<Report, Integer> {

    Page<Report> findAllByOrderByFechaDesc(Pageable pageable);

    Page<Report> findByTerritorioNumeroOrderByFechaDesc(Long territorioNumero, Pageable pageable);

    Page<Report> findByEncargadoIdOrderByFechaDesc(Long encargadoId, Pageable pageable);

    @Query(value = """
            SELECT DISTINCT ON (territorio_numero) *
            FROM registro_predicacion
            WHERE territorio_numero IN (:territorioNumeros)
            ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
            """, nativeQuery = true)
    List<Report> findLatestByTerritorioNumeroIn(@Param("territorioNumeros") Collection<Long> territorioNumeros);

    @Query(value = """
            SELECT DISTINCT ON (territorio_numero) territorio_numero, id
            FROM registro_predicacion
            WHERE territorio_numero IN (:territorioNumeros)
              AND (manzanas_ids IS NOT NULL AND manzanas_ids <> ''
                   OR manzana_id IS NOT NULL
                   OR geometria_parcial IS NOT NULL)
            ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
            """, nativeQuery = true)
    List<Object[]> findVersions(@Param("territorioNumeros") Collection<Long> territorioNumeros);

    @Query("SELECT r FROM Report r WHERE r.fecha BETWEEN :inicio AND :fin ORDER BY r.fecha DESC")
    Page<Report> findByFechaRange(@Param("inicio") Instant inicio, @Param("fin") Instant fin, Pageable pageable);
}
