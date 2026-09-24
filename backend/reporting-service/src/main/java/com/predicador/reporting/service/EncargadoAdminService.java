package com.predicador.reporting.service;

import com.predicador.reporting.dto.EncargadoAdminDto;
import com.predicador.reporting.dto.EncargadoAdminRequest;
import com.predicador.reporting.model.Encargado;
import com.predicador.reporting.repository.EncargadoRepository;
import com.predicador.reporting.repository.ReportRepository;
import com.predicador.shared.exception.ResourceNotFoundException;
import com.predicador.shared.util.PhoneUtil;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Gestión de encargados y de sus credenciales desde el panel de
 * administración. Las rutas que lo usan exigen rol admin
 * ({@code /api/v1/encargados/admin/**} en {@code SecurityRules}).
 */
@Service
public class EncargadoAdminService {

    static final int LARGO_PIN = 6;

    private final EncargadoRepository encargados;
    private final ReportRepository reportes;
    private final PasswordEncoder pinEncoder;
    private final SecureRandom random = new SecureRandom();

    public EncargadoAdminService(EncargadoRepository encargados, ReportRepository reportes,
                                 PasswordEncoder pinEncoder) {
        this.encargados = encargados;
        this.reportes = reportes;
        this.pinEncoder = pinEncoder;
    }

    /** Todos los encargados (también los desactivados), con su actividad. */
    @Transactional(readOnly = true)
    public List<EncargadoAdminDto> listar() {
        Map<Long, Object[]> resumen = new HashMap<>();
        for (Object[] fila : reportes.resumenPorEncargado()) {
            resumen.put(((Number) fila[0]).longValue(), fila);
        }
        return encargados.findAll().stream()
                .sorted(Comparator.comparing((Encargado e) -> e.getNombre().toLowerCase())
                        .thenComparing(e -> e.getApellido().toLowerCase())
                        .thenComparing(Encargado::getId))
                .map(e -> toDto(e, resumen.get(e.getId())))
                .toList();
    }

    @Transactional
    public EncargadoAdminDto crear(EncargadoAdminRequest req) {
        String telefono = PhoneUtil.normalize(req.telefono());
        exigirIdentidadLibre(req.nombre(), req.apellido(), null);
        exigirTelefonoLibre(telefono, null);

        Encargado e = new Encargado();
        e.setNombre(req.nombre().trim());
        e.setApellido(req.apellido().trim());
        e.setTelefono(telefono);
        e.setAvatar(req.avatar() != null ? req.avatar() : 1);
        e.setActivo(req.activo() == null || req.activo());
        return toDto(encargados.saveAndFlush(e), null);
    }

    @Transactional
    public EncargadoAdminDto actualizar(Long id, EncargadoAdminRequest req) {
        Encargado e = buscar(id);
        String telefono = PhoneUtil.normalize(req.telefono());
        exigirIdentidadLibre(req.nombre(), req.apellido(), id);
        exigirTelefonoLibre(telefono, id);

        e.setNombre(req.nombre().trim());
        e.setApellido(req.apellido().trim());
        e.setTelefono(telefono);
        if (req.avatar() != null) e.setAvatar(req.avatar());
        if (req.activo() != null) e.setActivo(req.activo());
        return conResumen(encargados.saveAndFlush(e));
    }

    /**
     * Borra un encargado sin reportes (típicamente una prueba o un alta por
     * error). Con reportes se conserva el historial: hay que desactivarlo o
     * fusionarlo con su registro correcto.
     */
    @Transactional
    public void eliminar(Long id) {
        Encargado e = buscar(id);
        long total = reportes.countByEncargadoId(id);
        if (total > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getNombre() + " tiene " + total
                    + " reporte(s). Desactivalo o fusionalo con otro encargado para conservar el historial.");
        }
        encargados.delete(e);
    }

    /**
     * Genera un PIN nuevo y lo devuelve en claro una sola vez: solo se guarda
     * su hash. Desde ese momento el encargado entra con teléfono + PIN.
     */
    @Transactional
    public String generarPin(Long id) {
        Encargado e = buscar(id);
        String pin = String.format("%0" + LARGO_PIN + "d", random.nextInt((int) Math.pow(10, LARGO_PIN)));
        e.setPinHash(pinEncoder.encode(pin));
        e.setPinActualizadoEn(Instant.now());
        e.setPinIntentosFallidos(0);
        e.setPinBloqueadoHasta(null);
        encargados.save(e);
        return pin;
    }

    /** Vuelve a login solo con teléfono. */
    @Transactional
    public EncargadoAdminDto quitarPin(Long id) {
        Encargado e = buscar(id);
        e.setPinHash(null);
        e.setPinActualizadoEn(Instant.now());
        e.setPinIntentosFallidos(0);
        e.setPinBloqueadoHasta(null);
        return conResumen(encargados.save(e));
    }

    @Transactional
    public EncargadoAdminDto desbloquear(Long id) {
        Encargado e = buscar(id);
        e.setPinIntentosFallidos(0);
        e.setPinBloqueadoHasta(null);
        return conResumen(encargados.save(e));
    }

    /**
     * Une un encargado duplicado ({@code origenId}) con el correcto
     * ({@code destinoId}): sus reportes pasan al destino y el duplicado se
     * borra. Si el destino no tiene teléfono, hereda el del duplicado.
     */
    @Transactional
    public EncargadoAdminDto fusionar(Long origenId, Long destinoId) {
        if (Objects.equals(origenId, destinoId)) {
            throw new IllegalArgumentException("No se puede fusionar un encargado consigo mismo");
        }
        Encargado origen = buscar(origenId);
        Encargado destino = buscar(destinoId);
        reportes.reasignarEncargado(origenId, destinoId, destino.getNombre(), destino.getApellido());
        String telefonoOrigen = origen.getTelefono();
        encargados.delete(origen);
        encargados.flush();
        if ((destino.getTelefono() == null || destino.getTelefono().isBlank()) && telefonoOrigen != null) {
            destino.setTelefono(telefonoOrigen);
        }
        return conResumen(encargados.saveAndFlush(destino));
    }

    private Encargado buscar(Long id) {
        return encargados.findById(id).orElseThrow(() -> new ResourceNotFoundException("Encargado", id));
    }

    private void exigirIdentidadLibre(String nombre, String apellido, Long exceptoId) {
        encargados.findByNaturalIdentity(nombre.trim(), apellido.trim())
                .filter(otro -> !otro.getId().equals(exceptoId))
                .ifPresent(otro -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Ya existe un encargado llamado " + otro.getNombre() + " " + otro.getApellido());
                });
    }

    /**
     * El teléfono identifica al encargado en el login, así que no puede
     * repetirse. Se comparan solo los dígitos y con/sin prefijo 56 porque hay
     * datos antiguos guardados en ambos formatos.
     */
    private void exigirTelefonoLibre(String telefono, Long exceptoId) {
        String clave = claveTelefono(telefono);
        encargados.findAll().stream()
                .filter(otro -> !otro.getId().equals(exceptoId))
                .filter(otro -> clave.equals(claveTelefono(otro.getTelefono())))
                .findFirst()
                .ifPresent(otro -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "El teléfono ya lo usa " + otro.getNombre() + " " + otro.getApellido());
                });
    }

    /** Dígitos del teléfono sin el prefijo de país chileno. */
    static String claveTelefono(String telefono) {
        if (telefono == null) return "";
        String digitos = telefono.replaceAll("[^0-9]", "");
        return digitos.startsWith("56") && digitos.length() == 11 ? digitos.substring(2) : digitos;
    }

    private EncargadoAdminDto conResumen(Encargado e) {
        Object[] fila = reportes.resumenPorEncargado().stream()
                .filter(f -> ((Number) f[0]).longValue() == e.getId())
                .findFirst()
                .orElse(null);
        return toDto(e, fila);
    }

    private EncargadoAdminDto toDto(Encargado e, Object[] resumen) {
        long total = resumen == null ? 0 : ((Number) resumen[1]).longValue();
        Instant ultimo = resumen == null ? null : (Instant) resumen[2];
        Instant bloqueo = e.getPinBloqueadoHasta() != null && e.getPinBloqueadoHasta().isAfter(Instant.now())
                ? e.getPinBloqueadoHasta() : null;
        return new EncargadoAdminDto(e.getId(), e.getNombre(), e.getApellido(), e.getTelefono(), e.getAvatar(),
                !Boolean.FALSE.equals(e.getActivo()), e.tienePin(), e.getPinActualizadoEn(), bloqueo,
                e.getUltimoAcceso(), e.getCreadoEn(), total, ultimo);
    }
}
