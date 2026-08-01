package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.shared.security.SessionToken;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class EncargadoService {

    private final EncargadoRepository repository;
    private final AuthorizationService authorization;

    public EncargadoService(EncargadoRepository repository, AuthorizationService authorization) {
        this.repository = repository;
        this.authorization = authorization;
    }

    public Page<EncargadoDto> listarActivos(Pageable pageable, SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findByActivoTrueOrderByNombreAsc(pageable).map(this::toDto);
    }

    @Transactional
    public Optional<EncargadoDto> buscarOCrear(String nombre, String apellido, String telefono) {
        String nombreLimpio = nombre != null ? nombre.trim() : "";
        String apellidoLimpio = apellido != null ? apellido.trim() : "";
        String telefonoLimpio = normalizePhone(telefono);

        Optional<Encargado> encontrado = repository.findByNaturalIdentity(
                nombreLimpio, apellidoLimpio);

        if (encontrado.isPresent()) {
            Encargado encargado = encontrado.get();
            if (telefonoLimpio != null && !telefonoLimpio.isBlank()) {
                encargado.setTelefono(telefonoLimpio);
            }
            return Optional.of(toDto(repository.save(encargado)));
        }

        EncargadoDto dto = new EncargadoDto(null, nombreLimpio, apellidoLimpio, 1, telefonoLimpio, true);
        try {
            return Optional.of(crear(dto));
        } catch (DataIntegrityViolationException collision) {
            return repository.findByNaturalIdentity(nombreLimpio, apellidoLimpio)
                    .map(this::toDto);
        }
    }

    @Transactional
    public EncargadoDto crear(EncargadoDto dto) {
        Encargado encargado = new Encargado();
        encargado.setNombre(dto.nombre() != null ? dto.nombre().trim() : "");
        encargado.setApellido(dto.apellido() != null ? dto.apellido().trim() : "");
        encargado.setAvatar(dto.avatar() != null ? dto.avatar() : 1);
        // Normalizamos aquí para que el registro directo respete el mismo
        // formato E.164 chileno que buscarOCrear/buscarPorTelefono.
        encargado.setTelefono(normalizePhone(dto.telefono()));
        encargado.setActivo(true);
        Encargado saved = repository.saveAndFlush(encargado);
        return toDto(saved);
    }

    @Transactional
    public EncargadoDto actualizar(Long id, EncargadoDto dto, SessionToken token) {
        authorization.authorizeOwner(token, id);
        Encargado encargado = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Encargado", id));
        encargado.setNombre(dto.nombre() != null ? dto.nombre().trim() : encargado.getNombre());
        encargado.setApellido(dto.apellido() != null ? dto.apellido().trim() : encargado.getApellido());
        if (dto.avatar() != null) encargado.setAvatar(dto.avatar());
        if (dto.telefono() != null) encargado.setTelefono(normalizePhone(dto.telefono()));
        if (dto.activo() != null) encargado.setActivo(dto.activo());
        Encargado saved = repository.save(encargado);
        return toDto(saved);
    }

    public Page<EncargadoDto> buscarPorNombre(String nombre, Pageable pageable, SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findByNombreContainingIgnoreCaseOrApellidoContainingIgnoreCaseOrderByNombreAsc(
                nombre, nombre, pageable).map(this::toDto);
    }

    public Optional<EncargadoDto> buscarPorTelefono(String telefono) {
        if (telefono == null || telefono.isBlank()) {
            return Optional.empty();
        }
        String normalizado = normalizePhone(telefono);
        if (normalizado == null || normalizado.isBlank()) {
            return Optional.empty();
        }
        // Buscar primero el número normalizado (con 56)
        Optional<Encargado> encontrado = repository.findByTelefono(normalizado);
        if (encontrado.isPresent()) {
            return encontrado.map(this::toDto);
        }
        // Fallback: buscar sin prefijo 56 (datos legacy)
        final String sinPrefijo;
        if (normalizado.startsWith("56") && normalizado.length() == 11) {
            sinPrefijo = normalizado.substring(2);
            encontrado = repository.findByTelefono(sinPrefijo);
            if (encontrado.isPresent()) {
                return encontrado.map(this::toDto);
            }
        } else {
            sinPrefijo = normalizado;
        }
        // Fallback final: comparar sólo dígitos (ignora espacios en BD legacy)
        return repository.findByActivoTrueOrderByNombreAsc().stream()
                .filter(e -> {
                    if (e.getTelefono() == null) return false;
                    String bdDigits = e.getTelefono().replaceAll("[^0-9]", "");
                    return bdDigits.equals(normalizado) || bdDigits.equals(sinPrefijo);
                })
                .findFirst()
                .map(this::toDto);
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
