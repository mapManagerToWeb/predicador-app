package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoDto;
import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.shared.security.SessionToken;
import com.predicador.shared.util.PhoneUtil;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.time.Instant;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class EncargadoService {

    /** Intentos de PIN fallidos seguidos antes de bloquear. */
    static final int MAX_INTENTOS_PIN = 5;
    static final Duration BLOQUEO_PIN = Duration.ofMinutes(15);

    private final EncargadoRepository repository;
    private final AuthorizationService authorization;
    private final ConfiguracionService configuracion;
    private final PasswordEncoder pinEncoder;

    public EncargadoService(EncargadoRepository repository, AuthorizationService authorization) {
        this(repository, authorization, null, new BCryptPasswordEncoder());
    }

    @Autowired
    public EncargadoService(EncargadoRepository repository, AuthorizationService authorization,
                            ConfiguracionService configuracion, PasswordEncoder pinEncoder) {
        this.repository = repository;
        this.authorization = authorization;
        this.configuracion = configuracion;
        this.pinEncoder = pinEncoder;
    }

    public Page<EncargadoDto> listarActivos(Pageable pageable, SessionToken token) {
        authorization.requireAdmin(token);
        return repository.findByActivoTrueOrderByNombreAsc(pageable).map(this::toDto);
    }

    /**
     * Auto-registro desde la app ("creá tu perfil"): si el nombre ya existe
     * entra como ese encargado, si no lo crea.
     *
     * <p>Entrar por nombre no prueba identidad, así que se niega cuando el
     * administrador cerró el registro, y para encargados con PIN o
     * desactivados (esos entran solo con teléfono + PIN).</p>
     */
    @Transactional
    public Optional<EncargadoDto> buscarOCrear(String nombre, String apellido, String telefono) {
        String nombreLimpio = nombre != null ? nombre.trim() : "";
        String apellidoLimpio = apellido != null ? apellido.trim() : "";
        String telefonoLimpio = PhoneUtil.normalize(telefono);

        exigirRegistroAbierto();
        Optional<Encargado> encontrado = repository.findByNaturalIdentity(
                nombreLimpio, apellidoLimpio);

        if (encontrado.isPresent()) {
            Encargado encargado = encontrado.get();
            if (encargado.tienePin() || Boolean.FALSE.equals(encargado.getActivo())) {
                throw new EncargadoLoginException(HttpStatus.CONFLICT, EncargadoLoginException.YA_REGISTRADO,
                        "Ya existe un encargado con ese nombre. Ingresá con tu número de teléfono.");
            }
            if (telefonoLimpio != null && !telefonoLimpio.isBlank()) {
                encargado.setTelefono(telefonoLimpio);
            }
            encargado.setUltimoAcceso(Instant.now());
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

    /** Alta pública (desde la app): solo con el registro abierto. */
    @Transactional(noRollbackFor = DataIntegrityViolationException.class)
    public EncargadoDto registrar(EncargadoDto dto) {
        exigirRegistroAbierto();
        return crear(dto);
    }

    /**
     * Crea un encargado.
     *
     * <p>Esta operación se invoca desde {@link #buscarOCrear} cuando no
     * existe el registro. Si dos requests concurrentes llegan con el mismo
     * {@code (nombre, apellido)}, la base de datos rechaza la segunda
     * inserción con {@link DataIntegrityViolationException}. Esa excepción
     * <em>debe</em> propagarse hacia afuera para que el caller pueda leer
     * el ganador, pero no queremos que marque la transacción externa como
     * rollback-only (lo que provocaría
     * {@code UnexpectedRollbackException} al intentar el commit).
     *
     * <p>{@code noRollbackFor} permite que la constraint exception
     * se propague sin contaminar la transacción padre. El catch en
     * {@code buscarOCrear} se hace cargo de la colisión y consulta el
     * ganador persistido.
     */
    @Transactional(noRollbackFor = DataIntegrityViolationException.class)
    public EncargadoDto crear(EncargadoDto dto) {
        Encargado encargado = new Encargado();
        encargado.setNombre(dto.nombre() != null ? dto.nombre().trim() : "");
        encargado.setApellido(dto.apellido() != null ? dto.apellido().trim() : "");
        encargado.setAvatar(dto.avatar() != null ? dto.avatar() : 1);
        // Normalizamos aquí para que el registro directo respete el mismo
        // formato E.164 chileno que buscarOCrear/buscarPorTelefono.
        encargado.setTelefono(PhoneUtil.normalize(dto.telefono()));
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
        if (dto.telefono() != null) encargado.setTelefono(PhoneUtil.normalize(dto.telefono()));
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
        return resolverPorTelefono(telefono).map(this::toDto);
    }

    /**
     * Login de encargado: teléfono y, si el administrador le asignó uno, PIN.
     * Tras {@value #MAX_INTENTOS_PIN} PIN incorrectos seguidos la cuenta queda
     * bloqueada {@link #BLOQUEO_PIN} (además del rate-limit por IP del gateway).
     *
     * <p>{@code noRollbackFor}: el contador de intentos fallidos debe quedar
     * guardado aunque el login termine en excepción.</p>
     */
    @Transactional(noRollbackFor = EncargadoLoginException.class)
    public EncargadoDto autenticar(String telefono, String pin) {
        Encargado encargado = resolverPorTelefono(telefono)
                .orElseThrow(() -> new EncargadoLoginException(HttpStatus.NOT_FOUND,
                        EncargadoLoginException.NO_ENCONTRADO,
                        "Encargado no encontrado con el teléfono proporcionado"));
        if (Boolean.FALSE.equals(encargado.getActivo())) {
            throw new EncargadoLoginException(HttpStatus.FORBIDDEN, EncargadoLoginException.INACTIVO,
                    "Tu cuenta está desactivada. Hablá con el administrador.");
        }
        if (encargado.tienePin()) {
            verificarPin(encargado, pin);
        }
        encargado.setUltimoAcceso(Instant.now());
        return toDto(repository.save(encargado));
    }

    private void verificarPin(Encargado encargado, String pin) {
        Instant ahora = Instant.now();
        if (encargado.getPinBloqueadoHasta() != null && encargado.getPinBloqueadoHasta().isAfter(ahora)) {
            long minutos = Math.max(1, Duration.between(ahora, encargado.getPinBloqueadoHasta()).toMinutes());
            throw new EncargadoLoginException(HttpStatus.LOCKED, EncargadoLoginException.PIN_BLOQUEADO,
                    "Demasiados intentos. Probá de nuevo en " + minutos + " minuto(s) o pedí un PIN nuevo.");
        }
        if (pin == null || pin.isBlank()) {
            throw new EncargadoLoginException(HttpStatus.UNAUTHORIZED, EncargadoLoginException.PIN_REQUERIDO,
                    "Ingresá tu PIN");
        }
        if (!pinEncoder.matches(pin, encargado.getPinHash())) {
            int intentos = encargado.getPinIntentosFallidos() + 1;
            if (intentos >= MAX_INTENTOS_PIN) {
                encargado.setPinBloqueadoHasta(ahora.plus(BLOQUEO_PIN));
                intentos = 0;
            }
            encargado.setPinIntentosFallidos(intentos);
            repository.save(encargado);
            throw new EncargadoLoginException(HttpStatus.UNAUTHORIZED, EncargadoLoginException.PIN_INCORRECTO,
                    "PIN incorrecto");
        }
        encargado.setPinIntentosFallidos(0);
        encargado.setPinBloqueadoHasta(null);
    }

    private void exigirRegistroAbierto() {
        if (configuracion != null && !configuracion.registroAbierto()) {
            throw new EncargadoLoginException(HttpStatus.FORBIDDEN, EncargadoLoginException.REGISTRO_CERRADO,
                    "El registro de nuevos encargados está cerrado. Pedile al administrador que te dé de alta.");
        }
    }

    private Optional<Encargado> resolverPorTelefono(String telefono) {
        if (telefono == null || telefono.isBlank()) {
            return Optional.empty();
        }
        String normalizado = PhoneUtil.normalize(telefono);
        if (normalizado == null || normalizado.isBlank()) {
            return Optional.empty();
        }
        // Buscar primero el número normalizado (con 56)
        Optional<Encargado> encontrado = repository.findByTelefono(normalizado);
        if (encontrado.isPresent()) {
            return encontrado;
        }
        // Fallback: buscar sin prefijo 56 (datos legacy)
        final String sinPrefijo;
        if (normalizado.startsWith("56") && normalizado.length() == 11) {
            sinPrefijo = normalizado.substring(2);
            encontrado = repository.findByTelefono(sinPrefijo);
            if (encontrado.isPresent()) {
                return encontrado;
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
                .findFirst();
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

}
