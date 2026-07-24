package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class EncargadoService {

    private final EncargadoRepository repository;

    public EncargadoService(EncargadoRepository repository) {
        this.repository = repository;
    }

    public List<EncargadoDto> listarActivos() {
        return repository.findByActivoTrueOrderByNombreAsc()
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public EncargadoDto crear(EncargadoDto dto) {
        Encargado encargado = new Encargado();
        encargado.setNombre(dto.nombre());
        encargado.setApellido(dto.apellido());
        encargado.setAvatar(dto.avatar() != null ? dto.avatar() : 1);
        encargado.setActivo(true);
        Encargado saved = repository.save(encargado);
        return toDto(saved);
    }

    public EncargadoDto actualizar(Long id, EncargadoDto dto) {
        Encargado encargado = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Encargado no encontrado: " + id));
        encargado.setNombre(dto.nombre());
        encargado.setApellido(dto.apellido());
        if (dto.avatar() != null) encargado.setAvatar(dto.avatar());
        if (dto.activo() != null) encargado.setActivo(dto.activo());
        Encargado saved = repository.save(encargado);
        return toDto(saved);
    }

    public Optional<EncargadoDto> buscarPorNombreApellido(String nombre, String apellido) {
        return repository.findByNombreAndApellido(nombre, apellido).map(this::toDto);
    }

    public List<EncargadoDto> buscarPorNombre(String nombre) {
        return repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(nombre, nombre)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    private EncargadoDto toDto(Encargado encargado) {
        return new EncargadoDto(
                encargado.getId(),
                encargado.getNombre(),
                encargado.getApellido(),
                encargado.getAvatar(),
                encargado.getActivo()
        );
    }
}
