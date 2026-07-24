package com.predicador.reporting.repository;

import com.predicador.reporting.model.Encargado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EncargadoRepository extends JpaRepository<Encargado, Long> {

    List<Encargado> findByActivoTrueOrderByNombreAsc();

    List<Encargado> findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
            String nombre, String apellido);
}
