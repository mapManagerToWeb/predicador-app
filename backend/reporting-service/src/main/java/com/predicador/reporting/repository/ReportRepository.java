package com.predicador.reporting.repository;

import com.predicador.reporting.model.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface ReportRepository extends JpaRepository<Report, Integer> {

    List<Report> findAllByOrderByFechaDesc();

    List<Report> findByTerritorioNumeroOrderByFechaDesc(Long territorioNumero);

    List<Report> findByEncargadoIdOrderByFechaDesc(Long encargadoId);

    @Query("SELECT r FROM Report r WHERE r.fecha BETWEEN :inicio AND :fin ORDER BY r.fecha DESC")
    List<Report> findByFechaRange(@Param("inicio") Instant inicio, @Param("fin") Instant fin);
}
