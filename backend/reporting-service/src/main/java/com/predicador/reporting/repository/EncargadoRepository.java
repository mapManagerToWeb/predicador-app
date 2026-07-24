package com.predicador.reporting.repository;

import com.predicador.reporting.model.Encargado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EncargadoRepository extends JpaRepository<Encargado, Long> {

    List<Encargado> findByActivoTrueOrderByNombreAsc();

    Optional<Encargado> findByNombreAndApellido(String nombre, String apellido);

    List<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido);
}
