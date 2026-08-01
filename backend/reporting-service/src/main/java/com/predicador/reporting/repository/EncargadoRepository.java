package com.predicador.reporting.repository;

import com.predicador.reporting.model.Encargado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EncargadoRepository extends JpaRepository<Encargado, Long> {

    List<Encargado> findByActivoTrueOrderByNombreAsc();
    Page<Encargado> findByActivoTrueOrderByNombreAsc(Pageable pageable);

    List<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido);
    Page<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido, Pageable pageable);

    Optional<Encargado> findByNombreIgnoreCaseAndApellidoIgnoreCase(String nombre, String apellido);

    Optional<Encargado> findByTelefono(String telefono);
}
