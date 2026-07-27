package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.shared.exception.ResourceNotFoundException;
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

    public Optional<EncargadoDto> buscarOCrear(String nombre, String apellido, String telefono) {
        String nombreLimpio = nombre != null ? nombre.trim() : "";
        String apellidoLimpio = apellido != null ? apellido.trim() : "";
        String telefonoLimpio = normalizePhone(telefono);

        List<Encargado> existentes = repository
                .findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
                        nombreLimpio, apellidoLimpio);

        Optional<Encargado> encontrado = existentes.stream()
                .filter(e -> e.getNombre().equalsIgnoreCase(nombreLimpio)
                        && e.getApellido().equalsIgnoreCase(apellidoLimpio))
                .findFirst();

        if (encontrado.isPresent()) {
            Encargado encargado = encontrado.get();
            if (telefonoLimpio != null && !telefonoLimpio.isBlank()) {
                encargado.setTelefono(telefonoLimpio);
            }
            return Optional.of(toDto(repository.save(encargado)));
        }

        EncargadoDto dto = new EncargadoDto(null, nombreLimpio, apellidoLimpio, 1, telefonoLimpio, true);
        return Optional.of(crear(dto));
    }

    public EncargadoDto crear(EncargadoDto dto) {
        Encargado encargado = new Encargado();
        encargado.setNombre(dto.nombre());
        encargado.setApellido(dto.apellido());
        encargado.setAvatar(dto.avatar() != null ? dto.avatar() : 1);
        encargado.setTelefono(dto.telefono());
        encargado.setActivo(true);
        Encargado saved = repository.save(encargado);
        return toDto(saved);
    }

    public EncargadoDto actualizar(Long id, EncargadoDto dto) {
        Encargado encargado = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Encargado", id));
        encargado.setNombre(dto.nombre());
        encargado.setApellido(dto.apellido());
        if (dto.avatar() != null) encargado.setAvatar(dto.avatar());
        if (dto.telefono() != null) encargado.setTelefono(dto.telefono());
        if (dto.activo() != null) encargado.setActivo(dto.activo());
        Encargado saved = repository.save(encargado);
        return toDto(saved);
    }

    public List<EncargadoDto> buscarPorNombre(String nombre) {
        return repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(nombre, nombre)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public Optional<EncargadoDto> buscarPorTelefono(String telefono) {
        if (telefono == null || telefono.isBlank()) {
            return Optional.empty();
        }
        return repository.findByTelefono(normalizePhone(telefono)).map(this::toDto);
    }

    private EncargadoDto toDto(Encargado encargado) {
        return new EncargadoDto(
                encargado.getId(),
                encargado.getNombre(),
                encargado.getApellido(),
                encargado.getAvatar(),
                encargado.getTelefono(),
                encargado.getActivo()
        );
    }

    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 9 && digits.startsWith("9")) {
            return "56" + digits;
        }
        return digits;
    }
}
