package com.predicador.reporting.repository;

import com.predicador.reporting.model.Encargado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface EncargadoRepository extends JpaRepository<Encargado, Long> {

    List<Encargado> findByActivoTrueOrderByNombreAsc();
    Page<Encargado> findByActivoTrueOrderByNombreAsc(Pageable pageable);

    List<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido);
    Page<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido, Pageable pageable);

    @Query("select e from Encargado e where lower(trim(e.nombre)) = lower(trim(:nombre)) "
            + "and lower(trim(e.apellido)) = lower(trim(:apellido))")
    Optional<Encargado> findByNaturalIdentity(@Param("nombre") String nombre, @Param("apellido") String apellido);

    Optional<Encargado> findByTelefono(String telefono);
}
